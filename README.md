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

**Handy & Tablet:** Die Steuerung sieht aus wie ein Gamepad. Links ist ein Analogstick, der dorthin springt, wo der Daumen aufsetzt. Rechts liegen die Aktionstasten als Raute: Sprung unten, Lasso rechts, Halten links, Knoten oben; allein darüber die Schultertasten Wechsel und Huckepack. Das Spiel geht beim Start in den Vollbildmodus und will quer gehalten werden. Auf dem iPhone gibt es Vollbild über „Teilen → Zum Home-Bildschirm“.

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

## Grafik

Gespielt wird auf einer Ebene, dargestellt wird die Welt in 3D (WebGL mit Three.js), ähnlich wie bei Unravel:

- Felsblöcke reichen nach hinten in die Tiefe. Ihre Oberflächen tragen Foto-Texturen (Erde, Fels, Gras, Holz) mit Normal-Maps, eingefärbt je Stimmung. Darauf stehen Grashalme, die sich im Wind bewegen, Büsche, Laub, Zweige, Kiesel und Steine, aus den Erdwänden ragen Steine, an Kanten hängen Wurzeln.
- Das Licht kommt aus echten HDR-Himmelsaufnahmen (Wald, Sonnenaufgang, Sonnenuntergang, Nacht) und einer Sonne mit weichen Schatten. Ein Gegenlicht zeichnet Lichtkanten, durch den Wald fallen Lichtbahnen.
- Hinter der Spielebene stehen Laub- und Nadelbäume, Birken oder Herbstbäume in mehreren Reihen, die Kronen aus Foto-Laub, dahinter Berge im Nebel.
- Gras wächst in Büscheln aus schmalen, gebogenen Halmen, durch die das Licht scheint. Windböen laufen als Welle über die Wiese, dazwischen stehen Blumen und Pilze, Steine tragen Moos.
- Wasser spiegelt, was über ihm liegt, mit Wellen, die sich bei Regen verstärken. Dazu kommen Tiefenunschärfe, Leuchten, Vignette und Filmkorn.
- **Wetter** (Taste „Wetter“ im Titel und in der Pause): Sonne, Regen, Sturm, Schnee oder „Automatisch“ je Level. Regen fällt mit Spritzern auf Boden und Wasser, Erde und Steine werden dunkel und glänzend, auf ebenen Stellen bilden sich Pfützen. Im Sturm biegen sich Gras und Bäume, es blitzt und donnert. Bei Schnee legt sich eine Schneedecke auf alle nach oben zeigenden Flächen und auf die Grasspitzen. Wolken, Licht, Nebel, Farbstimmung und Geräusche (Regenrauschen, Wind, Donner; Vögel schweigen) wechseln weich mit. Das Spielgeschehen bleibt bei jedem Wetter gleich.
- Die Figuren bestehen aus echten 3D-Wollfäden mit Stoffglanz und Flaum, die Fäden zwischen ihnen sind 3D-Röhren.

Ein Level wird beim Start ein paar Sekunden aufgebaut; solange steht das Spiel. Damit es danach flüssig läuft:

- Die Szene ist in Abschnitte geteilt, gezeichnet wird nur, was im Bild liegt. Gras, Steine und Laub sind Instanzen (ein Zeichenaufruf je Abschnitt).
- Die Tiefenunschärfe liest den vorhandenen Tiefenpuffer, statt die Szene ein zweites Mal zu zeichnen.
- Die Auflösung passt sich laufend an, damit die Bildrate bei 60 bleibt; reicht das nicht, sinkt die Qualitätsstufe.
- Fäden werden in feste Puffer geschrieben statt jedes Bild neu angelegt, Shader und Texturen werden beim Laden vorbereitet.

Wird `index.html` direkt von der Festplatte geöffnet (`file://`), erlaubt der Browser WebGL keine Bilddateien; dann nimmt die 3D-Grafik berechnete Texturen. Die Einzeldatei (`node tools/build.js`) und die GitHub-Pages-Seite enthalten die Fotos.

Unter „Grafik“ (Titel und Pause) lässt sich die Stufe wählen: 3D hoch, mittel, einfach oder 2D. Auf Handys und Fernsehern startet das Spiel mit „mittel“. Läuft es zu langsam, senkt es erst die Auflösung und dann die Stufe; eine selbst gewählte Stufe bleibt aber stehen. Eine feste Obergrenze von 30 Bildern pro Sekunde (etwa im Stromsparmodus) gilt nicht als Überlastung. Ohne echte Grafikkarte, etwa bei reinem Software-Rendering, nimmt es die 2D-Grafik. Mit `?gfx=2d` oder `?gfx=3d` in der Adresse lässt sich das erzwingen.

## Klang

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
| `src/render3d.js` | 3D-Grafik (Three.js): Gelände, Bäume, Licht, Wasser, Woll-Figuren |
| `src/assets3d.js` | Lädt Foto-Texturen und HDR-Himmel |
| `src/textures.js` | Prozedurale Texturen mit Normal-Maps (Ausweichlösung, Wolle) |
| `src/weather.js` | Wetter: Kenngrößen, Überblendung, Blitz, Regen und Schnee für die 2D-Grafik |
| `src/render.js` | 2D-Grafik (Ausweichlösung) und die Kamera, Hinweise als Overlay |
| `src/input.js` | Tastatur, Gamepads, virtuelle Controller, Vibration |
| `src/touch.js` | Touch-Steuerung im Gamepad-Look (auch der Handy-Controller) |
| `src/net.js` | Online-Spiel: Räume, Eingaben, Zustandsbilder |
| `src/audio.js` | Musik, Naturgeräusche, Effekte |
| `src/main.js` | Menüs, HUD, Netzwerkrollen, Hauptschleife |
| `vendor/` | Three.js (gebündelt aus `tools/three-entry.js`), PeerJS, qrcode-generator (alle MIT) |
| `assets/` | Foto-Texturen und HDRIs, aufbereitet mit `tools/make-assets.py` |

Die Physik läuft mit festem Zeitschritt (120 Hz) und ist unabhängig von der Grafik. Der Faden ist ein Seil mit Höchstlänge, das sich an Blockecken einhakt und wieder löst, so dass man über Kanten abseilen und pendeln kann.

## Quellen

- Texturen (Gras, Erde, Fels, Holz, Laub, Wasser): [Babylon.js Assets](https://github.com/BabylonJS/Assets), Lizenz [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Verkleinert, gleichmäßiger ausgeleuchtet, Normal-Maps teils aus der Helligkeit berechnet.
- HDR-Himmel (forest, sunrise, sunset, night): [Poly Haven](https://polyhaven.com), Lizenz CC0, über das npm-Paket [@pmndrs/assets](https://github.com/pmndrs/assets).

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
