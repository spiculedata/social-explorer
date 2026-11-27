"""Shared SQL-identifier and path-safety helpers for the ETL scripts.

Every identifier that reaches a SQL statement through these helpers is either
strictly allow-listed (so it cannot carry SQL metacharacters) or composed with
``psycopg2.sql.Identifier``, which wraps the value in double quotes and doubles
any embedded double quote, keeping it inside the quoted identifier.

Hostile inputs covered here:

* JSON keys from downloaded posts (``process_posts_pg.py`` bronze loader) --
  sanitised to ``[a-z0-9_]`` and never formatted into SQL.
* Schema/table names from the catalogue, CLI flags or local database catalogs
  (``datapackage_generator.py``, ``register_existing_datasets.py``,
  ``gdelt_processor_pg.py``) -- composed with ``sql.Identifier``.
* Dataset names used as output directory names
  (``datapackage_generator.py``) -- slugged to ``[a-z0-9-]`` and confined to
  the requested output directory.
"""

import re
from pathlib import Path

from psycopg2 import sql

_SAFE_IDENT_RE = re.compile(r'^[a-z0-9_]+$')
_UNSAFE_CHARS_RE = re.compile(r'[^a-z0-9_]')


def sanitize_column_name(name: str, max_len: int = 63) -> str:
    """Reduce an arbitrary JSON-key-derived column name to a safe identifier.

    Lowercases, replaces everything outside ``[a-z0-9_]`` with ``_`` and
    truncates to PostgreSQL's 63-byte identifier limit. The result can never
    carry SQL metacharacters such as ``"`` or ``;``.
    """
    return _UNSAFE_CHARS_RE.sub('_', str(name).lower())[:max_len]


def normalize_columns(columns, max_len: int = 63) -> list:
    """Sanitise column names and keep them unique (used by the bronze loader).

    Collisions after truncation get a numeric suffix; repeated normalisation is
    a no-op.
    """
    seen = {}
    result = []
    for raw in columns:
        truncated = sanitize_column_name(raw, max_len)
        if truncated in seen:
            seen[truncated] += 1
            result.append(truncated[:max_len - 4] + '_' + str(seen[truncated]))
        else:
            seen[truncated] = 0
            result.append(truncated)
    return result


def qualified(schema: str, table: str):
    """``schema.table`` composed from quoted identifiers."""
    return sql.SQL('{}.{}').format(sql.Identifier(schema), sql.Identifier(table))


def insert_composed(table, columns):
    """``INSERT INTO <table> (<cols>) VALUES %s`` for ``execute_values``."""
    return sql.SQL('INSERT INTO {} ({}) VALUES %s').format(
        table,
        sql.SQL(', ').join(sql.Identifier(col) for col in columns),
    )


def create_table_composed(table, column_defs):
    """``CREATE TABLE <table> (<col> <type>, ...)`` from (name, type) pairs.

    Types must be plain SQL type keywords from our own mappings; names are
    quoted identifiers.
    """
    return sql.SQL('CREATE TABLE {} ({})').format(
        table,
        sql.SQL(', ').join(
            sql.SQL('{} {}').format(sql.Identifier(name), sql.SQL(dtype))
            for name, dtype in column_defs
        ),
    )


def duckdb_ident(name: str) -> str:
    """Quote an identifier for a DuckDB SQL string (double quotes doubled).

    Used for the local DuckDB migration queries, which cannot be parameterised
    by identifier. Names still come from DuckDB's own catalog or fixed lists,
    so this is defence in depth.
    """
    return '"' + str(name).replace('"', '""') + '"'


def safe_filename(name: str) -> str:
    """Reduce a table name to a safe file stem, keeping ``[a-z0-9_-]``.

    Slashes and dots cannot survive, so the result stays one path component.
    """
    stem = re.sub(r'[^a-z0-9_-]+', '_', str(name).lower()).strip('_')
    return stem or 'table'


def slug_filename(name: str) -> str:
    """Slug a free-text dataset name into one safe path component.

    Everything outside ``[a-z0-9]`` (including slashes, dots and quotes)
    collapses to ``-``, so the result can never contain ``/`` or ``..``.
    """
    slug = re.sub(r'-{2,}', '-', re.sub(r'[^a-z0-9]+', '-', str(name).lower()))
    return slug.strip('-') or 'dataset'


def safe_output_path(output_dir, name: str) -> Path:
    """Join ``output_dir`` with the slugged dataset name and confine it.

    Returns a path guaranteed to sit inside ``output_dir`` (or equals it,
    which callers reject); raises ``ValueError`` if it would resolve outside,
    e.g. when ``output_dir`` itself contains symlinked components.
    """
    base = Path(output_dir).resolve()
    target = (base / slug_filename(name)).resolve()
    if target != base and not target.is_relative_to(base):
        raise ValueError(f"Dataset name {name!r} escapes the output directory")
    return target
