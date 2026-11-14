"""Normalise un dump `pg_dump --schema-only` pour comparer prod et rejeu (job R2).

Ignore ce qui ne change pas le schéma : espaces de fin, lignes vides, retours chariot,
ordre des colonnes dans CREATE TABLE (une colonne ajoutée plus tard n'est pas au même
rang qu'en prod) et donc ordre des commentaires de colonnes (renvoyés à la fin, triés).
Usage : python3 normalize_schema.py dump.sql > dump.norm.sql
"""
import re
import sys

out, comments, block = [], [], None
with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
    for raw in f:
        line = raw.rstrip("\r\n").rstrip()
        if not line.strip():
            continue
        if block is not None:
            if line == ");":
                out += sorted(l.rstrip(",") for l in block)
                out.append(line)
                block = None
            else:
                block.append(line)
            continue
        if line.startswith("COMMENT ON COLUMN ") and line.endswith(";"):
            comments.append(line)
            continue
        out.append(line)
        if re.match(r"^CREATE (UNLOGGED )?TABLE .*\($", line):
            block = []
sys.stdout.write("\n".join(out + sorted(comments)) + "\n")
