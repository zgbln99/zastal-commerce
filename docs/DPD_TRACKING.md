# DPD tracking

The account and receipt show carrier progress separately from order fulfillment.
Public reads use only the local cache and existing order authorization. No API
endpoint accepts an arbitrary public waybill lookup.

## Configuration

Store `ZASTAL_DPD_LOGIN` and `ZASTAL_DPD_PASSWORD` in the protected runtime
environment. Set `ZASTAL_DPD_CHANNEL` only if assigned by DPD. Request access to
DPD InfoServices through the DPD account representative; shipping-label access
alone may not provide tracking permissions. Never commit credentials.

After API schema initialization, install deploy/zastal-store-dpd.service and
.timer. The timer runs every five minutes; each eligible waybill refreshes no
more often than every fifteen minutes, with bounded batches of twenty. The
worker performs no carrier requests when credentials are missing. A configured
service still needs an acceptance check using an authorized real shipment.

Staff enter the DPD waybill when dispatching a packed, eligible order. The
canonical DPD link is generated automatically. Official examples use thirteen
digits plus a checksum letter; numeric fourteen-character waybills also pass.
Label creation and pickup requests remain in the DPD system.

## Failure and privacy behavior

Carrier errors preserve the previous successful status and its timestamp. An
unconfigured integration shows the official tracking link without claiming a
live status. The cache stores only logistics descriptions, codes and timestamps;
provider bodies, recipient details and credentials are never logged or retained.
Changing a waybill invalidates its cached status, including in-flight updates.

DPD examples omit timestamp offsets; such times are interpreted in Europe/Warsaw.
Terminal returns and redirections stop polling the original waybill. Staff must
enter a replacement waybill when DPD issues one; the worker does not follow it.

Contract: [DPD Poland integration documentation](https://www.dpd.com/pl/pl/oferta-dla-firm/rozwiazania-it-dpd-polska/implementacja-wtyczek-web-service-dpd-polska/),
InfoServices PL bundle dated February 2026, object-service V1 SOAP operation and
terminal-event spreadsheet, checked 24 October 2026.
