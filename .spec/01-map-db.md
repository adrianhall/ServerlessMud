# Import of MAP data into D1 database

The directory `data/json` contains a conversion of the zone and world data for TBAMud (located in `data/tbamud`) to a JSON format.  Each JSON file contains the zone AND rooms for the zone.

**Goal**:
    1. Provide a `c.env.MAP` service binding that binds to a D1 database.
    2. Design a schema for the D1 database that allows normalized storage of all data in the JSON files.
    3. Implement an idempotent migration for creating appropriate database tables.
    4. Implement an idempotent import of all data in the zone files within `data/json`.
        - This can be handled by generating an idempotent migration of the data.
    5. Add a script `db:migrate:local` that applies the idempotent migrations to the local DB.
    6. Add a script `db:migrate:remote` that applies the idempotent migrations to the remote DB.
    7. Using `npm-run-all2`, add a `predeploy` script to `run-s db:migrate:remote`
    8. Using `npm-run-all2`, add a `predev` script to `run-s db:migrate:local`
    9. Run `db:migrate:local` and validate that the database was populated properly.

Notes:

- You can find all the information about the file formats in data/tbamud/doc/building.txt
- extra descriptions require care - the idea is that you say something like `describe <keyword>` and it produces the description.  Since the extra descriptions are a SET of keywords, they need to be normalized into "keyword" and "description".
- I need to review the schema before the data generator is written so that I can tweak the schema if necessary.

