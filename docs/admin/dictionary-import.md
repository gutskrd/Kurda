# Importing a dictionary

Hevalo ships with a few hundred hand-picked Kurmancî headwords (migration
`1751000094000`). That is enough for the games to be playable and nowhere near a
dictionary. This is how you add a real one.

## First: two sets, not one

`dict_entries` answers two different questions, and they want opposite things.

| | what it is | wants |
|---|---|---|
| **the pool** (`in_games = true`) | what a game *chooses from* — Wordle targets, Rhyme prompts | small, curated, recognisable |
| **the dictionary** (every row) | what a guess is *checked against* | as large as it can be |

A bad target is an unplayable round, so the pool stays hand-picked. A missing
word is a correct answer rejected, so the dictionary should be huge. This is why
an import must never land in the pool.

**It doesn't, by default.** `in_games` defaults to `false`, and only a word added
through the admin screen is created with it set. So an import makes the games
*better at accepting what players type* and changes nothing about what they ask.

Promote individual words later from **Admin → Games → Word pool**, switching the
view to *Dictionary only* and ticking **play**.

## The format

A JSON array. A sense needs **at least one** of `definitionEn` and
`definitionKu` — a word defined in Kurdish alone is a definition, and most of a
Kurdish source is exactly that. `pos` is one of `noun`, `verb`, `adjective`,
`adverb`, `pronoun`, `preposition`, `conjunction`, `particle`, `numeral`,
`phrase`, `other`.

```json
[
  {
    "headword": "roj",
    "dialect": "kurmanji",
    "senses": [
      {
        "pos": "noun",
        "definitionEn": "day; sun",
        "definitionKu": "rojê",
        "examples": [{ "textKu": "Roj baş", "textEn": "Good day" }]
      }
    ],
    "xrefs": [{ "headword": "rojname", "relation": "derived" }]
  }
]
```

## Running it

```
cd api
DATABASE_URL=… npx tsx scripts/import-lexicon.ts words.json --dry-run
```

Always dry-run first. It writes nothing and prints the conflict report.

De-duplication is by **normalised headword + part of speech**:

- new headword → the entry and its senses are created
- same headword, new part of speech → the sense joins the existing entry
- same headword and part of speech, same definition → skipped
- same headword and part of speech, **different** definition → reported as a
  conflict and never silently merged

Drop `--dry-run` once the report is clean.

## Where to get words

### kaikki.org — Wiktionary, machine-readable

The practical source. Two extractions matter, both from the **English** edition,
so the glosses are in English — which is what `definitionEn` needs:

- **Northern Kurdish** (Kurmancî) — ~8,200 senses
- **Central Kurdish** (Soranî) — ~1,700 senses

Ten thousand real entries with meanings is worth far more to a learner than a
hundred times as many bare headwords.

### All of Wîkîferheng, in one command

The Ferheng project publishes that extraction as ~105 letter-bucketed JSON files
with a manifest, and there is a driver for it:

```
cd api
DATABASE_URL=… npx tsx scripts/import-ferheng.ts --lang ku --dry-run --limit 1
```

`--lang` is `ku` (Kurmancî, ~447,000 entries), `sor` (Soranî) or `zza` (Zazakî).
It walks the manifest a file at a time rather than parsing 65 MB in one piece,
so an interrupted run keeps everything it already wrote.

**Measured on the real data**, one file at a time: 9,627 headwords in becomes
8,904 entries and 9,012 senses, all Kurdish-only, all `in_games = false`, in
about two minutes. The whole Kurmancî set is therefore around 90 minutes.

The shortfall — 9,627 in, 8,904 out — is diacritics. `headword_normalized` folds
them, so `zabit` and `zabît` are one identity to this schema; 7.5% of spellings
collide that way, which is roughly 33,000 words across the full set. They are
reported as conflicts rather than merged silently.

### Running it against production

The production database does not accept connections from outside its private
network, and it should stay that way. Run the import where the credentials
already live instead of bringing them to your machine:

1. Render dashboard → the API service → **Shell**
2. `cd /app`
3. One file first, writing nothing:
   `npx tsx api/scripts/import-ferheng.ts --lang ku --dry-run --limit 1`
4. Then the real run, detached, so closing the tab does not kill it:

```
nohup npx tsx api/scripts/import-ferheng.ts --lang ku > /tmp/ferheng.log 2>&1 &
tail -f /tmp/ferheng.log
```

`DATABASE_URL` is already in that service's environment; nothing needs to be
typed, pasted or stored anywhere.

It runs beside the live API and holds a connection for the duration, so start it
when traffic is low.

**If it stops**, the last progress line names the file it was on — `[41/105]` —
and that number goes straight back in:

```
npx tsx api/scripts/import-ferheng.ts --lang ku --from 41
```

Re-reading that file costs nothing; the importer skips what it has already seen.

### The large dumps, and what they actually are

You will see much larger figures advertised — the Ferheng app quotes 456,639
words. That is the **Kurdish-language** Wiktionary (`kuwiktionary`), and two
things follow:

- its definitions are **in Kurdish**, so they do not fill `definitionEn`; and
- most of the count is inflected forms and proper nouns, not dictionary entries.

That set is still useful, but for one job only: loaded with `in_games = false`
it makes guess validation generous. Do not mistake it for ten thousand
definitions.

### Licence — decide before you import

Everything above is derived from Wiktionary and carries **CC BY-SA 4.0 + GFDL**:

- **BY** — attribution is required. Credit Wiktionary/Wîkîferheng and name the
  licence somewhere a reader can find it.
- **SA** — share-alike. A dictionary database derived from it has to be offered
  under the same terms. This does not reach your application code; it does reach
  the dictionary data.

If that is not acceptable, the alternatives are a permissively licensed source,
a licensed commercial one, or building the dictionary through the admin screens
over time. The import path is the same either way.

The **BY** half is already shipped: both apps render a `SourceLine` under the
dictionary and under an entry, naming Wîkîferheng and linking the licence, in all
nine languages. Nothing more is needed for an import from that source.

## After importing

- **Admin → Games** shows both counts: words in the games, and words in the
  dictionary. Only the first says whether the games are playable.
- Rhyme coverage and the rhyme editor read the **pool**, not the dictionary.
  Deciding about several hundred thousand inflected forms is not curation.

Related: [granting admin access](./granting-admin.md).
