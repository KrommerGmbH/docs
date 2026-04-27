---
nav:
  title: Leitfaden für Entwicklerdokumentation (DE)
  position: 630

---

# Leitfaden für Entwicklerdokumentation (DE)

==========================================

==========================================

==========================================

## 1) Ziel (Overview)

------------------

------------------

------------------

Dieser Leitfaden definiert einen einheitlichen Stil für CMH-Entwicklerdokumente, damit **auch Junior-Entwickler die Schritte direkt nachvollziehen können**.

Kombiniert werden:

- strukturierte Doku-Abschnitte (Overview, Prerequisites, Configuration, Example, Events)
   - praxisnahe Abschnitte (Funktion, Trigger, Diagramm, Schrittfolge, Checkliste)

## 2) Analysierte Stilquellen

--------------------------

--------------------------

--------------------------

- Leitfäden mit Erweiterungsüberblick
   - konzeptorientierte Basisleitfäden
   - event-/webhook-zentrierte Leitfäden
   - Leitfäden mit Komponenten-Property-/Event-Tabellen

## 3) Pflichtstruktur eines Dokuments

----------------------------------

----------------------------------

----------------------------------

## Overview

--------

--------

--------

- Problem in 2–4 Zeilen
   - Zielgruppe (Niveau)

## Prerequisites

-------------

-------------

-------------

- notwendiges Vorwissen
   - notwendige Umgebung/Version

## At a glance

-----------

-----------

-----------

| Punkt | Inhalt |
|---|---|
| Funktion | Was wird gelöst |
| Trigger | Wann läuft es |
| Input | Welche Eingaben |
| Output | Welches Ergebnis |
| Schlüsseldateien | Relevante Pfade |

## Trigger & Flow

--------------

--------------

--------------

- Trigger erklären
   - mindestens ein Mermaid-Diagramm

```mermaid
flowchart LR
A[Trigger] --> B[Service]
B --> C[Ergebnis]
```text

## Example

-------

-------

-------

- minimales lauffähiges Beispiel
   - bevorzugt kurz und direkt nutzbar

## Events / Properties / API

-------------------------

-------------------------

-------------------------

| Event/Property | Beschreibung |
|---|---|
| `onSomething` | Ereignisbeschreibung |

## Schritt-für-Schritt

-------------------

-------------------

-------------------

1. Vorbereitung
2. Konfiguration
3. Ausführung
4. Prüfung

## Troubleshooting

---------------

---------------

---------------

- mindestens 3 häufige Fehler
   - jeweils Ursache + Lösung

## Checkliste

----------

----------

----------

- [ ] Keine toten Links
   - [ ] Beispielcode ist ausführbar
   - [ ] Keine Secrets/private Daten
   - [ ] Begriffe für Einsteiger erklärt

## Related Docs

------------

------------

------------

- Verwandte Dokumente

## 4) Schreibregeln

----------------

----------------

----------------

1. Kurze, klare Sätze
2. Konkrete Schritte vor Theorie
3. Immer Tabelle/Diagramm/Beispiel enthalten
4. Nur existierende reale Dateipfade verlinken
5. Keine Secrets/private URLs in Public-Dokus

## 5) CMH-spezifische Zusatzabschnitte

-----------------------------------

-----------------------------------

-----------------------------------

Wenn passend, ergänzen:

- **Function**
   - **Trigger**
   - **Diagram**
   - **Ops Notes**

## 6) Startvorlage

---------------

---------------

---------------

```markdown

# Titel

=====

=====

=====

## Overview

--------

--------

--------

## Prerequisites

-------------

-------------

-------------

## At a glance

-----------

-----------

-----------

| Punkt | Inhalt |
|---|---|
| Funktion | |
| Trigger | |
| Input | |
| Output | |
| Schlüsseldateien | |

## Trigger & Flow

--------------

--------------

--------------

```mermaid
flowchart LR
A[Trigger] --> B[Service] --> C[Ergebnis]
```text

## [Template] Example

------------------

------------------

------------------

## [Template] Events / Properties / API

------------------------------------

------------------------------------

------------------------------------

| Event/Property | Beschreibung |
|---|---|

## [Template] Schritt-für-Schritt

------------------------------

------------------------------

------------------------------

1.
2.
3.

## [Template] Troubleshooting

--------------------------

--------------------------

--------------------------

## [Template] Checkliste

---------------------

---------------------

---------------------

- [ ]

## See Also

--------

--------

--------

```text
