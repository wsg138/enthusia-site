from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


PROJECT_ROOT = Path(__file__).resolve().parent.parent
WIKI_OUTPUT_ROOT = PROJECT_ROOT / 'wiki-worker-output'
WIKI_API_URL = 'https://enthusia.miraheze.org/w/api.php'
BASELINE_MANIFEST_URL = (
    'https://raw.githubusercontent.com/'
    'wsg138/EnthusiaSentinel-Docs/wiki-preservation-baseline/manifest.json'
)


def _configured(value, default):
    configured = value.strip() if isinstance(value, str) else ''
    return configured or default


def _trusted_https_url(value, expected, label):
    configured = _configured(value, expected)
    parsed = urlsplit(configured)
    expected_parts = urlsplit(expected)
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError(f'{label} has an invalid port') from exc
    if (
        parsed.scheme != 'https'
        or parsed.hostname != expected_parts.hostname
        or port not in (None, 443)
        or parsed.username
        or parsed.password
        or parsed.path != expected_parts.path
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError(f'{label} must be {expected}')
    return urlunsplit(('https', expected_parts.hostname, expected_parts.path, '', ''))


def wiki_api_url(value=None):
    return _trusted_https_url(value, WIKI_API_URL, 'Wiki API URL')


def baseline_manifest_url(value=None):
    return _trusted_https_url(value, BASELINE_MANIFEST_URL, 'Wiki baseline URL')


def project_output_path(value=None, default='wiki-worker-output', allow_root=True):
    if WIKI_OUTPUT_ROOT.exists() and WIKI_OUTPUT_ROOT.resolve() != WIKI_OUTPUT_ROOT:
        raise ValueError('wiki-worker-output must not be a symbolic link')
    configured = Path(_configured(value, default))
    candidate = configured if configured.is_absolute() else PROJECT_ROOT / configured
    resolved = candidate.resolve()
    try:
        resolved.relative_to(WIKI_OUTPUT_ROOT)
    except ValueError as exc:
        raise ValueError(f'Wiki output must stay inside {WIKI_OUTPUT_ROOT}') from exc
    if not allow_root and resolved == WIKI_OUTPUT_ROOT:
        raise ValueError('Destructive wiki output must use a directory below wiki-worker-output')
    return resolved


def contained_file(directory, filename, label='Wiki filename'):
    if not isinstance(filename, str) or not filename or Path(filename).name != filename:
        raise ValueError(f'{label} must be a single filename')
    root = Path(directory).resolve()
    try:
        root.relative_to(WIKI_OUTPUT_ROOT)
    except ValueError as exc:
        raise ValueError(f'{label} directory must stay inside {WIKI_OUTPUT_ROOT}') from exc
    candidate = (root / filename).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError(f'{label} must stay inside {root}') from exc
    if candidate == root:
        raise ValueError(f'{label} must name a file')
    return candidate
