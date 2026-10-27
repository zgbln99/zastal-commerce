"""DPD SOAP contract and cache tests; no provider/customer network calls."""
import datetime as dt
import json
import os
from pathlib import Path
import sqlite3
import shutil
import subprocess
import tempfile
import unittest
import urllib.error
import xml.etree.ElementTree as ET
from unittest.mock import patch
import commerce_dpd as dpd

NUMBER = '0000001094090S'  # Official INFO_Services_v2 PDF example.
SECOND = '01765003987175'
ENV = {'ZASTAL_DPD_LOGIN':'fixture-user', 'ZASTAL_DPD_PASSWORD':'fixture-password', 'ZASTAL_DPD_CHANNEL':''}


def event(code='190101', label='Przesyłka doręczona', when='2018-02-15T15:52:29.886', number=NUMBER):
    root = ET.Element('eventsList')
    for key, value in [('businessCode',code),('description',label),('eventTime',when),('waybill',number)]:
        ET.SubElement(root,key).text = value
    ET.SubElement(root,'objectId').text = '7305000000269747964'
    data = ET.SubElement(root,'eventDataList')
    ET.SubElement(data,'description').text = 'Odbiorca'
    ET.SubElement(data,'value').text = 'PRIVATE RECEIVER'
    ET.SubElement(root,'parcelReference').text = 'PRIVATE REFERENCE'
    return ET.tostring(root,encoding='unicode')


def response(*events):
    return ('<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>'
            '<ns2:getEventsForWaybillV1Response xmlns:ns2="http://events.dpdinfoservices.dpd.com.pl/">'
            '<return><confirmId>0</confirmId>'+''.join(events)+'</return>'
            '</ns2:getEventsForWaybillV1Response></S:Body></S:Envelope>').encode()


class DPDTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.database = Path(self.tmp.name)/'dpd.sqlite'
        self.c = sqlite3.connect(self.database)
        self.c.row_factory = sqlite3.Row
        self.c.execute('CREATE TABLE order_details(order_id INTEGER PRIMARY KEY,mode TEXT,carrier TEXT,tracking_number TEXT,tracking_url TEXT,shipped_at TEXT)')
        self.c.execute('INSERT INTO order_details VALUES(1,?,?,?,?,?)',('live','DPD',NUMBER,'https://evil.test','2026-10-01'))
        self.c.commit()
        dpd.init_schema(self.c)
        self.c.commit()
        self.env = patch.dict(os.environ, ENV)
        self.env.start()

    def tearDown(self):
        self.env.stop(); self.c.close(); self.tmp.cleanup()

    def run_sync(self, payload=None):
        with patch.object(dpd,'TRANSPORT',return_value=payload or response(event())):
            return dpd.sync_pending(self.c)

    def test_public_legacy_connection_without_cache_schema_has_neutral_fallback(self):
        self.c.execute('DROP TABLE dpd_shipments');self.c.commit()
        with patch.object(dpd,'TRANSPORT',side_effect=AssertionError('network')):
            result=dpd.public_shipment(self.c,1)
        self.assertEqual(result['sync_state'],'pending')
        self.assertEqual(result['events'],[])

    def test_worker_no_credentials_returns_unavailable_and_missing_database_is_not_created(self):
        with patch.dict(os.environ,{'ZASTAL_DPD_LOGIN':'','ZASTAL_DPD_PASSWORD':''}),patch.object(dpd,'TRANSPORT',side_effect=AssertionError('network')):
            self.assertFalse(dpd.run_once(self.database)['configured'])
        missing=Path(self.tmp.name)/'missing.sqlite'
        with self.assertRaises(sqlite3.OperationalError):dpd.run_once(missing)
        self.assertFalse(missing.exists())

    def test_incremental_success_merges_history_and_new_latest_status(self):
        self.run_sync(response(event('170101','W oddziale','2026-01-01T10:00:00')))
        self.c.execute('UPDATE dpd_shipments SET attempted_at=NULL');self.c.commit()
        self.run_sync(response(event('999999','Nowy oficjalny status','2026-01-01T11:00:00')))
        result=dpd.public_shipment(self.c,1)
        self.assertEqual(result['status_code'],'999999')
        self.assertEqual([e['code'] for e in result['events']],['999999','170101'])

    def test_transport_blocks_redirects_without_forwarding_credentials(self):
        with self.assertRaises(dpd.DPDError) as error:
            dpd._NoRedirect().redirect_request(None,None,302,'SECRET',{},'https://evil.test')
        self.assertEqual(str(error.exception),'carrier_redirect')

    def test_request_uses_exact_soap_schema_and_xml_escaping(self):
        root=ET.fromstring(dpd.build_request(NUMBER,'user<&','password<&','123'))
        method=root.find('{http://schemas.xmlsoap.org/soap/envelope/}Body')[0]
        self.assertEqual(method.tag,'{http://events.dpdinfoservices.dpd.com.pl/}getEventsForWaybillV1')
        self.assertEqual([n.tag for n in method],['waybill','eventsSelectType','language','authDataV1'])
        self.assertEqual(method.findtext('eventsSelectType'),'ALL')
        self.assertEqual(method.findtext('authDataV1/login'),'user<&')
        self.assertEqual(method.findtext('authDataV1/password'),'password<&')

    def test_official_response_timezone_order_unknown_description_and_privacy(self):
        parsed=dpd.parse_response(response(event(), event('999999','Nieznany oficjalny status','2018-07-15T15:52:29')),NUMBER)
        self.assertEqual(parsed[0],{'code':'999999','label':'Nieznany oficjalny status','occurred_at':'2018-07-15T13:52:29+00:00'})
        self.assertEqual(parsed[1]['occurred_at'],'2018-02-15T14:52:29.886000+00:00')
        self.assertNotIn('PRIVATE',json.dumps(parsed))

    def test_known_recipient_descriptions_are_logistics_only(self):
        parsed=dpd.parse_response(response(event('511901','Przesyłka doręczona. Odbiorca Jan Kowalski')),NUMBER)
        self.assertEqual(parsed[0]['label'],'Przesyłka doręczona')

    def test_fault_malformed_dtd_oversize_and_foreign_waybill_fail_closed(self):
        bad=[b'not xml', b'<!DOCTYPE x><x/>', b'x'*(dpd.MAX_XML_BYTES+1),
             b'<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><S:Fault><faultstring>SECRET</faultstring></S:Fault></S:Body></S:Envelope>',
             response(event(number=SECOND)), response(event(when='nonsense')), b'<x/>']
        for payload in bad:
            with self.subTest(payload=payload[:30]),self.assertRaises(dpd.DPDError) as error:
                dpd.parse_response(payload,NUMBER)
            self.assertNotIn('SECRET',str(error.exception))

    def test_credentials_missing_never_fetches_and_public_read_never_fetches(self):
        with patch.dict(os.environ,{'ZASTAL_DPD_LOGIN':'','ZASTAL_DPD_PASSWORD':''}),patch.object(dpd,'TRANSPORT',side_effect=AssertionError('network')):
            self.assertFalse(dpd.sync_pending(self.c)['configured'])
            result=dpd.public_shipment(self.c,1)
            self.assertEqual(result['sync_state'],'not_configured')
            self.assertIsNone(result['status_code'])
            self.assertEqual(result['status_label'],dpd.FALLBACK_LABEL)
        with patch.object(dpd,'TRANSPORT',side_effect=AssertionError('GET network')):
            self.assertEqual(dpd.public_shipment(self.c,1)['sync_state'],'pending')

    def test_invalid_missing_non_dpd_and_test_orders_never_fetch(self):
        for carrier,number,mode in [('DPD','','live'),('DPD','../123','live'),('InPost',NUMBER,'live'),('DPD',NUMBER,'test')]:
            self.c.execute('UPDATE order_details SET carrier=?,tracking_number=?,mode=?',(carrier,number,mode));self.c.commit()
            with patch.object(dpd,'TRANSPORT',side_effect=AssertionError('network')):
                self.assertEqual(dpd.sync_pending(self.c)['selected'],0)
        self.assertIsNone(dpd.public_shipment(self.c,999))

    def test_safe_link_accepts_documented_checksum_and_rejects_injection(self):
        self.assertEqual(dpd.tracking_url(NUMBER),'https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1='+NUMBER)
        self.assertTrue(dpd.tracking_url(SECOND).endswith(SECOND))
        self.assertEqual(dpd.tracking_url('123&url=bad'),'')

    def test_cache_persists_history_and_does_not_copy_raw_payload(self):
        self.assertEqual(self.run_sync()['updated'],1)
        self.c.close();self.c=sqlite3.connect(self.database);self.c.row_factory=sqlite3.Row
        public=dpd.public_shipment(self.c,1)
        self.assertEqual(public['status_code'],'190101');self.assertEqual(public['source'],'dpd')
        self.assertEqual(public['sync_state'],'ok');self.assertEqual(len(public['events']),1)
        self.assertNotIn('PRIVATE',json.dumps(public))
        self.assertNotIn('fixture-password',self.database.read_bytes().decode(errors='ignore'))
        self.assertNotIn('PRIVATE',self.database.read_bytes().decode(errors='ignore'))
        self.assertNotIn('evil.test',public['tracking_url'])

    def test_empty_response_is_neutral_and_fresh_without_fabricated_status(self):
        self.run_sync(response())
        result=dpd.public_shipment(self.c,1)
        self.assertIsNone(result['status_code']);self.assertEqual(result['status_label'],dpd.FALLBACK_LABEL)
        self.assertEqual(result['events'],[]);self.assertIsNotNone(result['checked_at'])

    def test_failure_retains_last_success_timestamp_and_history(self):
        self.run_sync(response(event('170101','Przyjęcie w oddziale')))
        before=dpd.public_shipment(self.c,1)
        self.c.execute("UPDATE dpd_shipments SET attempted_at=NULL");self.c.commit()
        with patch.object(dpd,'TRANSPORT',side_effect=TimeoutError('fixture-password SECRET')):
            result=dpd.sync_pending(self.c)
        after=dpd.public_shipment(self.c,1)
        self.assertEqual(result['failed'],1);self.assertEqual(after['sync_state'],'error')
        self.assertEqual(after['checked_at'],before['checked_at']);self.assertEqual(after['events'],before['events'])
        self.assertNotIn('SECRET',json.dumps(after))

    def test_tracking_change_clears_old_cache_and_inflight_cannot_overwrite_even_aba(self):
        self.run_sync(response(event('170101','W oddziale')))
        self.c.execute('UPDATE order_details SET tracking_number=?',(SECOND,));self.c.commit()
        self.assertEqual(dpd.public_shipment(self.c,1)['events'],[])
        def changed(*args):
            with sqlite3.connect(self.database) as other:
                other.execute('UPDATE order_details SET tracking_number=?',(NUMBER,))
                other.execute('UPDATE order_details SET tracking_number=?',(SECOND,))
            return response(event(number=SECOND))
        with patch.object(dpd,'TRANSPORT',side_effect=changed):
            self.assertEqual(dpd.sync_pending(self.c)['updated'],0)
        self.assertEqual(dpd.public_shipment(self.c,1)['events'],[])

    def test_poll_interval_terminal_codes_and_history_bound(self):
        self.run_sync()
        with patch.object(dpd,'TRANSPORT',side_effect=AssertionError('terminal refetch')):
            self.assertEqual(dpd.sync_pending(self.c)['selected'],0)
        self.c.execute('UPDATE order_details SET tracking_number=?',(SECOND,));self.c.commit()
        events=[event('999999','Status '+str(i),f'2026-01-01T00:{i//60:02d}:{i%60:02d}',SECOND) for i in range(120)]
        self.run_sync(response(*events))
        public=dpd.public_shipment(self.c,1);self.assertEqual(len(public['events']),100)
        with patch.object(dpd,'TRANSPORT',side_effect=AssertionError('too soon')):
            self.assertEqual(dpd.sync_pending(self.c)['selected'],0)

    def test_network_never_occurs_with_open_transaction(self):
        self.c.execute("UPDATE order_details SET tracking_url=''")
        with patch.object(dpd,'TRANSPORT',side_effect=AssertionError('transaction network')),self.assertRaises(ValueError):
            dpd.sync_pending(self.c)
        self.c.rollback()

    @unittest.skipUnless(shutil.which('node') and (Path(__file__).resolve().parents[1]/'storefront/node_modules/typescript').is_dir(), 'React render checks require storefront node dependencies')
    def test_customer_component_real_render_fallback_history_staleness_and_links(self):
        script = "const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),Module=require('node:module');\nconst root=process.cwd(),base=path.join(root,'storefront'),req=Module.createRequire(path.join(base,'package.json'));\nconst ts=req('typescript'),React=req('react'),{renderToStaticMarkup}=req('react-dom/server');\nconst filename=path.join(base,'components/ShipmentTracking.tsx');\nrequire.extensions['.css']=()=>{};\nconst mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));\nmod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);\nconst component=mod.exports.default,number='0000001094090S';\nconst render=props=>renderToStaticMarkup(React.createElement(component,props));\nlet html=render({carrier:'DPD',trackingNumber:number,trackingUrl:'https://evil.test'});\nassert.match(html,/Aktualny status sprawdzisz na stronie DPD/);assert.match(html,/tracktrace.dpd.com.pl/);assert.doesNotMatch(html,/evil.test|Przesyłka nadana|Doręczona|credentials|API/);\nhtml=render({shipment:{carrier:'DPD',tracking_number:number,tracking_url:'https://evil.test',status_code:'190101',status_label:'Przesyłka doręczona',occurred_at:'2026-10-23T10:00:00+00:00',checked_at:'2026-10-23T11:00:00+00:00',events:[{code:'190101',label:'Przesyłka doręczona',occurred_at:'2026-10-23T10:00:00+00:00'}],sync_state:'error',source:'dpd'}});\nassert.match(html,/Przesyłka doręczona/);assert.match(html,/Ostatnio sprawdzono/);assert.match(html,/Nie udało się odświeżyć/);assert.match(html,/Historia przesyłki/);assert.doesNotMatch(html,/evil.test/);\nassert.equal(render({}), '');\nassert.doesNotMatch(render({carrier:'DPD',trackingNumber:'bad',trackingUrl:'javascript:alert(1)'}),/href=/);\nhtml=render({carrier:'InPost',trackingNumber:'123',trackingUrl:'https://inpost.pl/sledzenie'});assert.match(html,/https:\\/\\/inpost.pl\\/sledzenie/);assert.doesNotMatch(html,/DPD/);\nassert.doesNotMatch(render({carrier:'InPost',trackingNumber:'123',trackingUrl:'javascript:alert(1)'}),/href=/);\nconsole.log('ShipmentTracking: 7 SSR behavior checks passed');\n"
        result=subprocess.run(['node','-'],input=script,text=True,capture_output=True,cwd=Path(__file__).resolve().parents[1],timeout=30)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_transport_fixed_url_headers_timeout_and_bounded_read(self):
        class Reply:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,limit):
                self.limit=limit
                return response(event())
        reply=Reply()
        with patch('urllib.request.OpenerDirector.open',return_value=reply) as opening:
            dpd.fetch_events(NUMBER)
        request=opening.call_args.args[0]
        self.assertEqual(request.full_url,dpd.ENDPOINT)
        self.assertEqual(request.get_header('Soapaction'),'""')
        self.assertEqual(opening.call_args.kwargs['timeout'],10)
        self.assertEqual(reply.limit,dpd.MAX_XML_BYTES+1)


if __name__=='__main__':unittest.main()
