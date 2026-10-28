# Fadenfreunde

Ein kleiner 2D-Plattformer im Geist von *Unravel Two*: zwei Wollfiguren, Rot und Blau, hängen am selben Faden. Sie werfen Lassos an Haken, schwingen über Wasser, seilen sich gegenseitig ab, schieben Kisten und knüpfen Fäden zu Trampolinen. Man kann allein spielen oder zu zweit an einem Rechner.

Läuft komplett im Browser und braucht keine Installation und keinen Build-Schritt.

## Starten

`index.html` im Browser öffnen. Wer lieber einen lokalen Server nimmt:

```sh
npx serve .        # oder: python3 -m http.server
```

Eine einzelne, verschickbare HTML-Datei mit allem drin erzeugt:

```sh
node tools/build.js            # -> dist/fadenfreunde.html
```

## Spielen

**Allein:** Du steuerst eine Figur und trägst die andere huckepack. An Stellen, die zwei brauchen, setzt du den Partner ab (`F`). Er hält sich dann von selbst fest, und mit `Tab` wechselst du zu ihm.

**Zu zweit an einem Gerät:** Rot spielt links auf der Tastatur, Blau rechts, oder ihr nehmt Gamepads (USB oder Bluetooth). Wer oben steht, hält fest, und der andere schwingt oder klettert. Wer nicht festhält, wird vom hängenden Partner mitgerissen.

**Online & WLAN (zwei Geräte):** Einer erstellt unter „Online & WLAN“ einen Raum und bekommt einen vierstelligen Code und einen QR-Code. Der andere gibt den Code ein oder scannt ihn. Das klappt im selben WLAN und über das Internet. Die Geräte verbinden sich direkt per WebRTC (PeerJS); der öffentliche PeerJS-Server vermittelt nur den Verbindungsaufbau. Hinter manchen strengen Firmen- oder Mobilfunk-Netzen kann eine direkte Verbindung scheitern.

**Fernseher:** Die Seite im Browser des Fernsehers, Laptops oder Beamers öffnen und „Fernseher → Dieses Gerät ist der Bildschirm“ wählen. Die Handys scannen den QR-Code und werden zu Controllern mit Joystick, Vibration und Menüsteuerung. Mit Chrome auf Android geht auch „Auf Chromecast übertragen“; AirPlay und Android-„Übertragen“ spiegeln den ganzen Bildschirm.

**Controller:** Unter „Controller“ stehen alle erkannten Gamepads. Dort lässt sich jedem Rot oder Blau zuordnen und die Vibration testen; dazu gibt es eine Anleitung zum Koppeln per Bluetooth (Xbox, PlayStation, Switch Pro). Bluetooth selbst übernimmt das Betriebssystem, der Browser sieht den Controller nach dem ersten Tastendruck.

**Handy & Tablet:** Links irgendwo den Daumen aufsetzen und ziehen, das ist der Joystick. Rechts liegen Sprung, Lasso, Halten und Knoten. Das Spiel geht beim Start in den Vollbildmodus und will quer gehalten werden. Auf dem iPhone gibt es Vollbild über „Teilen → Zum Home-Bildschirm“.

Ins Ziel müssen immer beide.

| Aktion | Allein | Rot | Blau | Gamepad |
|---|---|---|---|---|
| Laufen / schwingen | `A` `D` / Pfeile | `A` `D` | `J` `L` / Pfeile | Stick |
| Springen, hochklettern | `W` / `↑` / Leertaste | `W` | `I` / `↑` | `A` (Klettern: Stick) |
| Abseilen | `S` / `↓` | `S` | `K` / `↓` | Stick runter |
| Lasso werfen / lösen | `Q` / `J` | `Q` | `U` | `X` |
| Festhalten (halten) | `E` / `K` | `E` | `O` | `RB` / `RT` |
| Knoten zwischen zwei Pflöcken | `R` / `L` | `R` | `P` | `B` |
| Figur wechseln | `Tab` | – | – | `Y` |
| Huckepack | `F` | – | – | `LB` |

`Esc` oder `Start` pausiert, `M` schaltet den Ton.

## Stimmung

Die Grafik setzt auf Gegenlicht, Dunst und Tiefenunschärfe: ferne Ebenen werden klein gerendert und weichgezeichnet, davor stehen unscharfe Gräser und Zweige. Dazu kommen weiche Lichtbahnen, Lichtkreise, Farbkorrektur und Filmkorn. Die Figuren bekommen einen Lichtsaum von der Sonnenseite. Läuft ein Gerät zu langsam, schaltet das Spiel selbst auf einfachere Grafik um.

Musik und Geräusche werden im Browser erzeugt: gezupfte Gitarre (Karplus-Strong), eine Fidel mit Vibrato und ein Bordun, je Level in eigener Tonart. Dazu Wind, Vögel, Wasser, Frösche, Krähen, Grillen und eine Eule, außerdem Schritte, das Knarzen des Fadens beim Klettern und Rauschen beim Schwingen.

## Level

1. **Morgengarten**: Laufen, Springen, das erste Lasso und ein Schwung über den Teich.
2. **Alter Steinbruch**: Festhalten, abseilen, am Faden des Partners hinüberschwingen und nachklettern.
3. **Am Teich**: Kisten schieben, auf einer treibenden Kiste übersetzen, eine Kiste, die nur zu zweit (oder huckepack) bewegt werden kann.
4. **Herbstwald**: Mit dem Lasso einen Faden zwischen zwei Pflöcken knoten und ihn als Trampolin nutzen.
5. **Heimweg**: Lasso-Kette über einen See, Dornengrube mit Faden-Pendel, Trampolin plus hoher Haken.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/core.js` | Konstanten, Mathe, Speicher |
| `src/physics.js` | Kollision, Kisten schieben, Faden mit Umwicklung an Kanten |
| `src/game.js` | Spiellogik: Figuren, Lasso, Knoten, Huckepack, Gefahren, Ziel |
| `src/levels.js` | Leveldaten und Hinweistafeln |
| `src/render.js` | Canvas-Grafik: Parallax-Landschaften, Figuren, Effekte |
| `src/input.js` | Tastatur, Gamepads, virtuelle Controller, Vibration |
| `src/touch.js` | Touch-Joystick und Knöpfe (auch der Handy-Controller) |
| `src/net.js` | Online-Spiel: Räume, Eingaben, Zustandsbilder |
| `src/audio.js` | Musik, Naturgeräusche, Effekte |
| `src/main.js` | Menüs, HUD, Netzwerkrollen, Hauptschleife |
| `vendor/` | PeerJS und qrcode-generator (MIT) |

Die Physik läuft mit festem Zeitschritt (120 Hz). Der Faden ist ein Seil mit Höchstlänge, das sich an Blockecken einhakt und wieder löst, so dass man über Kanten abseilen und pendeln kann.

## Tests

```sh
node tests/levels.test.js
```

Die Tests laden die Spiellogik ohne Browser und lassen einfache Bots die Kernstellen aller Level spielen, damit jedes Rätsel lösbar bleibt, allein wie zu zweit.

Das Online-Spiel und den Fernsehmodus prüft ein Ende-zu-Ende-Test mit lokalem Vermittlungsserver:

```sh
npm i --no-save peer express playwright
node tests/online.e2e.js
```
