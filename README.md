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

**Zu zweit:** Rot spielt links auf der Tastatur, Blau rechts (oder mit Gamepads). Wer oben steht, hält fest, und der andere schwingt oder klettert. Wer nicht festhält, wird vom hängenden Partner mitgerissen.

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

`Esc` pausiert, `M` schaltet den Ton. Auf Touch-Geräten erscheinen Knöpfe auf dem Bildschirm.

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
| `src/input.js` | Tastatur, Gamepads, Touch |
| `src/audio.js` | Synthetisierte Geräusche und Musik |
| `src/main.js` | Menüs, HUD, Hauptschleife |

Die Physik läuft mit festem Zeitschritt (120 Hz). Der Faden ist ein Seil mit Höchstlänge, das sich an Blockecken einhakt und wieder löst, so dass man über Kanten abseilen und pendeln kann.

## Tests

```sh
node tests/levels.test.js
```

Die Tests laden die Spiellogik ohne Browser und lassen einfache Bots die Kernstellen aller Level spielen, damit jedes Rätsel lösbar bleibt, allein wie zu zweit.
