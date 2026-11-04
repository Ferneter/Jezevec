# Jezevec — noční útěk lesem

Malá 2D arkáda pro web. Utíkej po noční lesní stezce, vyhýbej se pařezům a kládám, sbírej houby a udržuj si odstup od jezevce. Když energie klesne pod 50 %, může se na cestě objevit zelená láhev, která ji doplní.

## Ovládání

- **↑ / ↓** nebo **W / S** — změna stezky
- **Mezerník** — pauza / pokračování
- **Esc** — návrat na úvodní obrazovku
- Na telefonu klepni do horní nebo dolní části hry nebo přejeď prstem nahoru či dolů.

## Spuštění

Otevři `index.html` v prohlížeči nebo spusť jednoduchý lokální HTTP server:

```sh
python -m http.server 8000
```

Pak otevři `http://localhost:8000`.

## Veřejné spuštění přes GitHub Pages

V repozitáři je připravený workflow `.github/workflows/pages.yml`. Po nahrání projektu do GitHub repozitáře na větev `main` workflow stránku automaticky publikuje. V nastavení repozitáře otevři **Settings → Pages** a jako zdroj vyber **GitHub Actions**. Adresa hry se zobrazí v běhu workflow.

Osobní rekord se ukládá lokálně v prohlížeči návštěvníka.

## Veřejný žebříček přes Supabase

1. Vytvoř projekt v Supabase.
2. V **SQL Editoru** spusť obsah souboru `supabase/leaderboard.sql`. Pokud už žebříček používáš, spusť aktualizovaný skript znovu.
3. Zkopíruj Project URL a veřejný **publishable key** do `leaderboard-config.js`.
4. Nahraj změny do větve `main`; GitHub Pages zveřejní žebříček.

Žebříček dovoluje veřejné čtení. Nick se porovnává bez ohledu na velikost písmen a u každého nicku zůstane jen nejlepší skóre; stejné ani nižší skóre ho nepřepíše. Aktualizační skript sloučí případné starší duplicity a zachová nejvyšší výsledek. Protože hra běží v prohlížeči, výsledky nejsou odolné proti podvržení klientem.
