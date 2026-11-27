"""Failing-first regression tests for SQL identifier safety (issue #375).

The ETL scripts used to build SQL identifiers by f-string formatting from JSON
keys and catalogue values, so a hostile key or dataset name could change the
statement. These tests pin the fixed behaviour:

* a JSON key containing ``"`` and ``;`` cannot change the statement
* a dataset name containing ``../`` cannot escape the output directory
* identifiers are composed with ``psycopg2.sql`` instead of f-strings

The tests render the composed statements with a faithful stand-in for
PostgreSQL identifier quoting (wrap in double quotes, double embedded quotes),
because no live PostgreSQL connection is needed to verify statement shape.
"""

import re
from pathlib import Path

import pytest
from psycopg2 import sql

from sql_utils import (
    qualified,
    safe_output_path,
    sanitize_column_name,
    slug_filename,
)

EVIL_JSON_KEY = 'a" TEXT);DROP TABLE x;CREATE TABLE z("b'
EVIL_TABLE = 'x"; DROP TABLE t;--'


def render(composable):
    """Render a psycopg2.sql composition with stand-in identifier quoting."""
    if isinstance(composable, sql.Composed):
        return ''.join(render(part) for part in composable._wrapped)
    if isinstance(composable, sql.Identifier):
        return '.'.join(
            '"' + part.replace('"', '""') + '"' for part in composable._wrapped
        )
    if isinstance(composable, sql.SQL):
        return composable.string
    raise TypeError(type(composable))


# --- JSON-key-driven bronze loader columns ----------------------------------

def test_malicious_json_key_is_reduced_to_safe_charset():
    sanitized = sanitize_column_name(EVIL_JSON_KEY)
    assert re.fullmatch(r'[a-z0-9_]{1,63}', sanitized)
    assert '"' not in sanitized and ';' not in sanitized


def test_malicious_json_key_cannot_change_statement():
    from process_posts_pg import build_create_table_sql, build_insert_sql, normalize_columns

    columns = normalize_columns(['post_id', EVIL_JSON_KEY])
    created = render(build_create_table_sql(columns))
    inserted = render(build_insert_sql(columns))

    # The statement is still exactly one CREATE TABLE with quoted identifiers;
    # the key could not close it, run SQL, or open a new one.
    assert created.count('(') == 1 and created.count(')') == 1
    assert ';DROP' not in created and ';CREATE' not in created and 'DROP TABLE x' not in created
    assert inserted.count('(') == 1 and inserted.count(')') == 1
    assert ';' not in inserted
    assert inserted.endswith('VALUES %s')

    # Sanitising is idempotent: re-running it changes nothing.
    assert normalize_columns(columns) == columns


def test_deduplicated_truncated_columns_stay_safe():
    from process_posts_pg import normalize_columns

    long_key = 'attr_' + 'very_long_name_' * 10 + '"; DROP TABLE x'
    columns = normalize_columns([long_key, long_key, 'post_id'])
    assert len(columns) == len(set(columns))
    assert all(re.fullmatch(r'[a-z0-9_]{1,63}', c) for c in columns)
    assert 'post_id' in columns


# --- Shared composition helpers ---------------------------------------------

def test_evil_catalogue_table_name_is_quoted_not_executed():
    stmt = render(qualified('public', EVIL_TABLE))
    assert stmt == '"public"."x""; DROP TABLE t;--"'


def test_insert_composed_keeps_statement_shape():
    from sql_utils import insert_composed

    stmt = render(insert_composed(qualified('silver', 'posts'), ['id', EVIL_TABLE]))
    assert stmt.count('(') == 1 and stmt.count(')') == 1
    assert stmt.endswith('VALUES %s')
    assert 'DROP TABLE t' in stmt  # still present, but quoted inside the identifier


# --- Data package output path ------------------------------------------------

def test_dataset_name_with_dotdot_cannot_leave_output_dir(tmp_path):
    base = Path(tmp_path) / 'packages'
    target = safe_output_path(base, '../../../etc/evil')
    assert target != base
    assert base.resolve() in target.resolve().parents
    assert target.resolve().name == 'etc-evil'


def test_dataset_name_slugs_to_a_single_safe_component():
    assert slug_filename('../../etc/passwd') == 'etc-passwd'
    assert '/' not in slug_filename('../../etc/passwd')
    assert '..' not in slug_filename('../../etc/passwd')
    assert slug_filename('My Dataset: A "Title" (2026)') == 'my-dataset-a-title-2026'
    assert slug_filename('///') == 'dataset'


def test_absolutely_anchored_name_stays_inside_output_dir(tmp_path):
    base = Path(tmp_path) / 'packages'
    target = safe_output_path(base, '/etc/evil')
    assert base.resolve() in target.resolve().parents


def test_generate_datapackage_confines_hostile_dataset_name(tmp_path, monkeypatch):
    from datapackage_generator import generate_datapackage

    base = Path(tmp_path) / 'packages'
    monkeypatch.setattr('datapackage_generator.infer_schema_from_table',
                        lambda *a, **k: {'fields': [{'name': 'id', 'type': 'string'}]})
    monkeypatch.setattr('datapackage_generator.get_row_count', lambda *a, **k: 1)
    monkeypatch.setattr('datapackage_generator.extract_preview',
                        lambda *a, **k: [{'id': 'row-1'}])

    pkg = generate_datapackage(
        table_name='imported_table',
        dataset_name='Evil Package (bafy..abc) \\u00e9 ../../etc',
        output_dir=str(base),
    )

    # The package landed in one slug-named directory inside output_dir.
    written = [p for p in base.rglob('*') if p.is_file()]
    assert written, 'nothing was written'
    for path in written:
        assert base.resolve() in path.resolve().parents
        assert '..' not in path.name
    assert pkg['name'] == 'evil-package-bafy-abc-u00e9-etc'
