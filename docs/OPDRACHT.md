# README — Automatisering en Dashboardontwikkeling van de Urenregistratiedatabase

## Overzicht

Dit project automatiseert een bestaande urenregistratiedatabase en visualiseert de gegevens in een gebruiksvriendelijk dashboard. De applicatie geeft inzicht in gepresteerde uren per contract en taak, resterende budgetten, profielverdelingen en afwijkingen ten opzichte van vooraf bepaalde verdeelsleutels. Daarnaast bevat het systeem een geïntegreerde simulatietool die op basis van een offerte of opdrachtbrief automatisch een voorstel maakt voor de verdeling van uren over de verschillende profielen. [file:1]

Het doel van deze oplossing is om manuele opvolging te vervangen door een schaalbaar en uitbreidbaar systeem dat automatisch berekeningen uitvoert, visuele waarschuwingen toont en eenvoudig kan worden uitgebreid met nieuwe contracten, taken, profielen en medewerkers. De nadruk ligt op automatisering, correcte datakoppelingen, gebruiksgemak en visuele duidelijkheid. [file:1]

## Context

Binnen de organisatie worden gepresteerde werkuren geregistreerd in een centrale database. Elke tijdsinvoer is minimaal gekoppeld aan een medewerker, datum, aantal gepresteerde uren, taak, contract en profielcategorie. Contracten hebben telkens een vooraf bepaald totaalbudget aan uren of middelen, samen met een interne verdeelsleutel tussen de verschillende profielen, zoals manager, expert/senior en junior. [file:1]

Een voorbeeld uit de opdracht is contract AVSA24, waarbij de voorziene profielverdeling bestaat uit 3 procent manager, 31 procent expert/senior en 66 procent junior. Wanneer de werkelijke verdeling meer dan 3 procent afwijkt van deze doelverdeling, moet dit visueel worden gemarkeerd. [file:1]

## Doelstellingen

De applicatie moet de volgende doelstellingen realiseren:

- Automatisch inzicht bieden in het aantal gepresteerde uren per contract en per taak. [file:1]
- Het resterende urenbudget per contract berekenen en tonen. [file:1]
- De procentuele verdeling van uren per profielcategorie binnen elk contract berekenen en visualiseren. [file:1]
- Visuele waarschuwingen geven wanneer een contract zijn urenbudget bijna heeft bereikt, bijvoorbeeld oranje vanaf 85 procent en rood vanaf 95 procent. [file:1]
- De oplossing uitbreidbaar maken zodat toekomstige contracten, taken, profielen en medewerkers eenvoudig kunnen worden toegevoegd. [file:1]
- Een simulatietool voorzien die een voorstel van urenverdeling maakt op basis van een offerte of opdrachtbrief en vervolgens een PV van oplevering kan genereren. [file:1]

## Kernfunctionaliteiten

### 1. Dashboard

Het dashboard vormt het centrale overzicht van de applicatie. Gebruikers kunnen hier meteen zien hoeveel uren al gepresteerd zijn, hoeveel budget nog resteert en hoe de werkelijke profielverdeling zich verhoudt tot de geplande verdeling. Het dashboard moet filterbaar en sorteerbaar zijn per contract en taak en ondersteunt visuele componenten zoals balkdiagrammen en cirkeldiagrammen om snel inzicht te geven in de data. [file:1]

### 2. Automatische berekeningen

Voor elk contract voert het systeem automatisch een aantal kernberekeningen uit:

- Totaal gepresteerde uren per contract. [file:1]
- Resterende uren of budget per contract. [file:1]
- Totaal aantal uren per profielcategorie. [file:1]
- Percentuele verdeling van uren per profiel op basis van het totaal aantal gepresteerde uren. [file:1]
- Afwijking ten opzichte van de voorziene verdeelsleutel. [file:1]

Deze berekeningen moeten zonder manuele tussenkomst worden geüpdatet zodra nieuwe uren aan de databron worden toegevoegd. [file:1]

### 3. Visuele waarschuwingen

De applicatie moet afwijkingen en risicosituaties duidelijk signaleren via kleurcodes of andere visuele indicatoren. Contracten die 85 procent van hun urenbudget hebben verbruikt, krijgen een waarschuwing, en contracten vanaf 95 procent worden als kritisch gemarkeerd. Ook profielafwijkingen groter dan 3 procent moeten duidelijk zichtbaar worden voor de gebruiker. [file:1]

### 4. Simulatietool

Naast het dashboard bevat de oplossing een geïntegreerde simulatietool. Deze tool leest de totale voorziene uren en de urenverdeling tussen profielen in, via manuele input of via upload van een offerte of opdrachtbrief. Vervolgens genereert de tool automatisch een initieel voorstel voor urenverdeling tussen manager, expert/senior en junior, op basis van standaardpercentages of een aangepaste verdeelsleutel. [file:1]

De gebruiker moet dat voorstel kunnen accepteren, weigeren of manueel aanpassen. Op basis van de definitieve verdeling genereert het systeem automatisch een PV van oplevering dat kan worden geëxporteerd of doorgestuurd naar de opdrachtgever. Daarnaast moet het verschil tussen geplande en werkelijk gepresteerde uren ook visueel kunnen worden weergegeven. [file:1]

## Vereiste invoergegevens

Elke urenregistratie bevat minimaal de volgende velden:

- Naam van de medewerker. [file:1]
- Datum van de prestaties. [file:1]
- Aantal gepresteerde uren, bijvoorbeeld 3,8 voor een halve dag of 7,6 voor een volledige dag. [file:1]
- Bijhorende taak. [file:1]
- Bijhorend contract. [file:1]
- Profielcategorie, bijvoorbeeld manager, expert/senior of junior. [file:1]

Daarnaast bevat elk contract minstens een totaalbudget aan uren en een verdeelsleutel per profielcategorie. [file:1]

## Business rules

De applicatie houdt rekening met de volgende functionele regels:

- Een halve dag komt overeen met 3,8 uur. [file:1]
- Een volledige dag komt overeen met 7,6 uur. [file:1]
- Elke registratie moet gekoppeld zijn aan een taak en een contract. [file:1]
- Elke taak hoort bij een contract. [file:1]
- Elk contract heeft een vooraf bepaald urenbudget. [file:1]
- Elk contract heeft een interne verdelingssleutel tussen de profielen. [file:1]
- Afwijkingen van meer dan 3 procent ten opzichte van de doelverdeling moeten visueel worden aangeduid. [file:1]
- Budgetverbruik vanaf 85 procent moet als waarschuwing worden gemarkeerd. [file:1]
- Budgetverbruik vanaf 95 procent moet als kritisch worden gemarkeerd. [file:1]

## Filters en analyses

De oplossing moet toelaten om data overzichtelijk te filteren en te analyseren. Minstens de volgende filtermogelijkheden zijn relevant:

- Per contract. [file:1]
- Per taak. [file:1]
- Per profielcategorie. [file:1]
- Per medewerker. [file:1]
- Per datum of periode. [file:1]

Zo kunnen gebruikers zowel een algemeen overzicht als detailanalyses uitvoeren op contract- en taakniveau. De grafische weergaven helpen om trends, verdelingen en risico’s sneller te interpreteren. [file:1]

## Uitbreidbaarheid

Een belangrijk onderdeel van de opdracht is dat het systeem eenvoudig uitbreidbaar blijft. Nieuwe contracten, taken, profielen en medewerkers moeten zonder complexe technische aanpassingen kunnen worden toegevoegd. Dit is belangrijk omdat bestaande contracten kunnen aflopen en opgevolgd worden door nieuwe contracten met andere budgetten en verdeelsleutels. [file:1]

De oplossing moet daarom modulair en datagedreven worden opgezet, zodat een opvolger het systeem later eenvoudig kan aanvullen of aanpassen. [file:1]

## Technische vrijheid

De technologie voor deze oplossing mag vrij gekozen worden, mits overleg met de begeleider. In de opdracht worden onder meer Power BI, Tableau, Google Data Studio en Python-dashboards met Pandas of Plotly als mogelijke opties genoemd. Belangrijker dan de exacte toolkeuze zijn automatisering, correcte datakoppelingen, gebruiksgemak en visuele duidelijkheid. [file:1]

## Verwachte oplevering

De opdracht vraagt om twee concrete deliverables:

1. Een functionerend dashboard met geïntegreerde simulatietool. [file:1]
2. Een korte handleiding waarin de databron, automatische berekeningen, filters, simulatiefuncties en exportfunctie van het PV van oplevering worden toegelicht. [file:1]

## Samenvatting van de oplossing

Deze applicatie combineert operationele opvolging en planningsondersteuning in één systeem. Enerzijds maakt het dashboard de actuele stand van zaken zichtbaar voor contracten, taken en profielen. Anderzijds helpt de simulatietool bij het opstellen van een realistische en onderbouwde urenverdeling voor nieuwe opdrachten. [file:1]

Het resultaat is een centrale tool die zowel rapportering als besluitvorming ondersteunt en tegelijk voldoende flexibel is om later verder uit te bouwen. [file:1]