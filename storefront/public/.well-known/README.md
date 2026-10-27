# .well-known

Apple Pay przez PayU: PayU przekazuje plik `apple-developer-merchantid-domain-association` do weryfikacji domeny.
Wgraj go do tego katalogu (bez rozszerzenia) i wdróż storefront; Next serwuje go pod
`https://<domena>/.well-known/apple-developer-merchantid-domain-association`. Po weryfikacji w panelu PayU
przycisk Apple Pay pojawia się na stronie płatności PayU (w Safari i na iPhone) bez zmian w kodzie sklepu.
