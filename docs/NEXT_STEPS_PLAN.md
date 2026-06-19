# Next steps plan

Dit plan beschrijft de volgende productstappen voor het Uren Dashboard. De focus ligt op meer businesswaarde, betere overdraagbaarheid en een geloofwaardige route van demo-MVP naar interne SaaS-tool.

## Doel van de volgende fase

De volgende fase moet de applicatie minder afhankelijk maken van technische handelingen en meer bruikbaar maken voor niet-technische interne gebruikers. De kern blijft hetzelfde: betrouwbare uren, budgetten en profielverdelingen. Nieuwe functies moeten daarom de bestaande berekeningen respecteren en vooral helpen bij invoer, interpretatie, rapportage en beheer.

## Prioriteit 1: AI document assistant voor PV/rapporten

Integreer een AI-API voor het genereren van conceptteksten in PV's en rapporten. De AI mag geen budgetten, totalen of afwijkingen berekenen; die blijven uit de bestaande domeinlogica komen.

Aanpak:

- Voeg een conceptgeneratieflow toe aan de bestaande PV/rapportpagina.
- Gebruik contractinfo, budgetstatus, profielafwijkingen, simulatieverdeling en time-entry samenvattingen als input.
- Laat AI een managementsamenvatting, risico's, toelichting bij afwijkingen en voorgestelde PV-tekst genereren.
- Toon AI-output altijd eerst als concept dat de gebruiker kan aanpassen.
- Sla goedgekeurde tekst pas daarna op bij het rapport.

Acceptatiecriteria:

- Een gebruiker kan vanuit een simulatie een AI-concept voor een PV genereren.
- Het concept bevat geen zelfverzonnen cijfers.
- De gebruiker kan tekst aanpassen voordat het rapport definitief wordt.
- De database bewaart minstens status, gegenereerde tekst, modelnaam en datum.

## Prioriteit 2: Data-import volwassen maken

Maak import geschikt voor echte CSV/XLSX-bestanden uit de organisatie. De huidige import is goed voor MVP-validatie, maar moet veiliger en duidelijker worden voor eindgebruikers.

Status: geïmplementeerd als preview-, mapping- en bevestigingsflow. Verdere verfijning kan later nog focussen op grotere bestanden en downloadbare foutbestanden.

Aanpak:

- Voeg een import-preview toe voordat records worden opgeslagen.
- Toon validatiefouten per rij.
- Ondersteun kolommapping voor afwijkende Excel-kolomnamen.
- Geef samenvatting van geldige, ongeldige en dubbele records.
- Laat gebruikers import expliciet bevestigen.

Acceptatiecriteria:

- Een gebruiker ziet vooraf welke rijen geïmporteerd worden.
- Foute rijen blokkeren niet automatisch alle correcte rijen.
- Foutmeldingen noemen rij, veld en reden.
- Er is een downloadbare voorbeeldtemplate.

## Prioriteit 3: Beheer-CRUD uitbouwen

Maak de beheerpagina operationeel zodat toekomstige beheerders zonder code nieuwe stamdata kunnen toevoegen of aanpassen.

Status: geïmplementeerd als beheer-CRUD voor contracten, taken, profielen, medewerkers en verdeelsleutels. Stamdata wordt gedeactiveerd in plaats van verwijderd en verdeelsleutels worden op 100% gevalideerd.

Aanpak:

- Voeg CRUD toe voor contracten, taken, profielen, medewerkers en verdeelsleutels.
- Gebruik deactiveren in plaats van hard delete voor stamdata die al gebruikt wordt.
- Valideer dat verdeelsleutels per contract samen 100% vormen.
- Voorkom dat taken aan meerdere contracten gekoppeld raken.
- Toon waar stamdata al gebruikt wordt voordat wijzigingen worden opgeslagen.

Acceptatiecriteria:

- Een beheerder kan een nieuw contract met taken en verdeelsleutel aanmaken.
- Een beheerder kan medewerkers koppelen aan profielcategorieën.
- Ongeldige verdeelsleutels worden geweigerd met duidelijke melding.
- Historische time entries blijven intact na beheerwijzigingen.

## Prioriteit 4: Actiegerichte dashboardalerts

Maak het dashboard meer actiegericht. Het moet niet alleen tonen wat er is gebeurd, maar ook duidelijk maken waar opvolging nodig is.

Status: geïmplementeerd als prioriteitslijst op het dashboard met budget-, profielmix-, actualiteits- en taakverdelingsalerts plus directe actielinks.

Aanpak:

- Voeg een alerts-sectie toe met prioritering.
- Markeer contracten met budgetverbruik vanaf 85% en 95%.
- Markeer profielafwijkingen groter dan 3%.
- Toon contracten zonder recente time entries.
- Toon taken met opvallend hoog urenverbruik.
- Voeg snelle links toe naar contractdetail, time entries en simulatie.

Acceptatiecriteria:

- Kritieke alerts staan boven warnings.
- Elke alert bevat een duidelijke reden en een link naar de juiste actie.
- Alerts gebruiken dezelfde businessregels als de rest van de app.
- Het dashboard blijft snel scanbaar op desktop en tablet.

## Prioriteit 5: Rollen, audit trail en deployment

Breng de app dichter bij echte interne SaaS-productie door rechten, traceerbaarheid en deploymentafspraken toe te voegen.

Aanpak:

- Voeg eenvoudige rollen toe: `admin`, `editor`, `viewer`.
- Beperk verwijderen, budgetwijzigingen en verdeelsleutels tot admins.
- Log belangrijke wijzigingen in een audit trail.
- Bereid PostgreSQL-configuratie voor naast de huidige SQLite-demo.
- Voeg production environment documentatie toe.

Acceptatiecriteria:

- Viewers kunnen data bekijken maar niet wijzigen.
- Editors kunnen time entries beheren maar geen budgetten aanpassen.
- Admins kunnen stamdata en verdeelsleutels beheren.
- Belangrijke wijzigingen zijn terug te vinden met gebruiker, datum en actie.
- Er is een duidelijke route naar PostgreSQL/deployment.

## Aanbevolen sprintvolgorde

1. AI PV-generator en concept/goedkeuringsflow.
2. Import-preview, kolommapping en rijvalidatie.
3. Beheer-CRUD voor stamdata en verdeelsleutels.
4. Actiegerichte dashboardalerts.
5. Rollen, audit trail en PostgreSQL/deployment hardening.

## Beslisregels voor vervolgbouw

- Businessberekeningen blijven deterministisch in `lib/domain`.
- AI mag teksten formuleren, maar niet de bron van cijfers zijn.
- Nieuwe features moeten demo-data blijven ondersteunen.
- Beheeracties moeten veilig zijn voor historische records.
- Elke sprint eindigt met bijgewerkte README of docs als gedrag verandert.
