# GitHub workflow

Deze workflow gebruiken we consequent om wijzigingen naar GitHub te brengen.

## 1. Controleer de status

```bash
git status --short
git remote -v
```

Controleer altijd of er ongerelateerde of persoonlijke bestanden tussen staan. Commit geen lokale secrets of machine-specifieke bestanden zoals `.env`; gebruik `.env.example` voor deelbare configuratie.

## 2. Verifieer de app

Voor functionele wijzigingen:

```bash
npm run test:domain
npm run build
```

Voor database-demo's:

```bash
npm run db:init
npm run db:seed
```

`npm run db:init` is de lokale fallback wanneer `prisma db push` op Windows geen bruikbare schema-engine output geeft.

## 3. Stage bewust

Stage alleen bestanden die bij de wijziging horen:

```bash
git add README.md docs/GITHUB_WORKFLOW.md app components lib prisma scripts package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs next-env.d.ts .gitignore .env.example
```

Laat tijdelijke, persoonlijke of onduidelijke bestanden ongestaged tot duidelijk is dat ze in de repo thuishoren.

## 4. Commit helder

Gebruik korte, beschrijvende commits:

```bash
git commit -m "Build demo-ready uren dashboard MVP"
```

Commitberichten beschrijven het resultaat, niet de interne stappen.

## 5. Push naar GitHub

```bash
git push origin HEAD
```

Controleer na de push met:

```bash
git status --short
```

De status mag alleen bewust ongetrackte lokale bestanden tonen.
