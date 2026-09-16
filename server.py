#!/usr/bin/env python3
"""Server di sviluppo per openRun: come `python3 -m http.server`, ma
- ascolta su tutte le interfacce (0.0.0.0), così è raggiungibile dal telefono;
- manda `Cache-Control: no-store`, per non tenere in cache JS/CSS vecchi;
- stampa l'URL LAN da digitare sul telefono.

    python3 server.py [porta]        # default 8000

ATTENZIONE (webcam su mobile): `http://<ip-lan>:8000` NON è un "contesto
sicuro" per il browser, quindi `getUserMedia` viene bloccato e la webcam non
parte. Il gioco funziona, i gesti no. Per sbloccare la camera su telefono
servono HTTPS o un'origine dichiarata sicura: vedi README, sezione
"Test su mobile".
"""

import http.server
import socket
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


def lan_ip():
    """IP della scheda usata per uscire in rete (nessun pacchetto inviato)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(('8.8.8.8', 80))
        return sock.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        sock.close()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    ip = lan_ip()
    print('openRun in ascolto su tutte le interfacce (porta %d):' % port)
    print('  pc      http://localhost:%d/' % port)
    print('  mobile  http://%s:%d/   <- stessa Wi-Fi, poi apri questo' % (ip, port))
    print()
    print('La webcam su mobile richiede HTTPS o un\'origine sicura.')
    print('Senza: il gioco parte, i comandi del corpo no. Vedi README.')
    sys.stdout.flush()
    http.server.test(HandlerClass=NoCache, port=port, bind='0.0.0.0')
