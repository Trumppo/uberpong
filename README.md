# UBERPONG: Pinball Court

UBERPONG on Pongin moderni, taitopohjainen ja "uberöity" tulkinta. Toteutus on täysin staattinen HTML5 Canvas -peli ilman backendiä.

## Sisältö

- Kaikki Pongin peruselementit:
  - 2 mailaa
  - 1 kiekko
  - pisteytys
  - syötöt ja ralli
- Uber-ominaisuudet:
  - Tempo (0-100), joka kasvattaa pelin intensiteettiä
  - Kombo, joka kasvaa jokaisesta onnistuneesta torjunnasta
  - Riskialueet (bonuspisteet)
  - Slap Shot (aktiivikyky cooldownilla)
  - Pelimuodot: Casual, Arena, Endurance
  - Vaihe 2:
    - AI-vastustaja (1P moodi)
    - Partikkeliefektit osumiin/maaleihin
    - Kevyt WebAudio-SFX (M = mute/unmute)
    - Mobiilikontrollit (on-screen painikkeet)

## Käynnistys

Avaa `index.html` selaimessa tai aja kevyt staattinen palvelin:

```bash
cd uberpong
python3 -m http.server 8080
```

Sitten avaa `http://localhost:8080`.

## Ohjaimet

- P1: `W` / `S`
- P2: `ArrowUp` / `ArrowDown`
- P1 Slap Shot: `Shift`
- P2 Slap Shot: `Enter`
- SFX mute/unmute: `M`
- Mobiili: ruudun alalaidan virtuaalinapit

## Konfigurointi

Pelin moodit ja riskialueet ovat tiedostossa:

- `config/courts.json`

## Dokumentaatio

- Vision PDF: `docs/UBERPONG-vision.pdf`
