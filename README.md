# Jezevec — noční útěk lesem

Malá 2D arkáda pro web. Utíkej po noční lesní stezce, vyhýbej se pařezům a kládám, sbírej houby a udržuj si odstup od jezevce. Když energie klesne pod 50 %, může se na cestě objevit zelená láhev, která ji doplní.

## Ovládání

- **← / →** nebo **A / D** — změna směru
- **Mezerník** — pauza / pokračování
- **Esc** — návrat na úvodní obrazovku
- Na telefonu klepni do levé nebo pravé části hry nebo přejeď prstem.

## Spuštění

Otevři `index.html` v prohlížeči nebo spusť jednoduchý lokální HTTP server:

```sh
python -m http.server 8000
```

Pak otevři `http://localhost:8000`.

## Veřejné spuštění přes GitHub Pages

V repozitáři je připravený workflow `.github/workflows/pages.yml`. Po nahrání projektu do GitHub repozitáře na větev `main` workflow stránku automaticky publikuje. V nastavení repozitáře otevři **Settings → Pages** a jako zdroj vyber **GitHub Actions**. Adresa hry se zobrazí v běhu workflow.

Osobní rekord se ukládá lokálně v prohlížeči návštěvníka. Sdílená tabulka výsledků by vyžadovala samostatné online úložiště.
