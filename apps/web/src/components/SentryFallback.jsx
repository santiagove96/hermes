export default function SentryFallback() {
  return (
    <main style={{ padding: 'var(--content-padding)', textAlign: 'center', marginTop: '80px' }}>
      <h1
        style={{
          fontSize: 'var(--text-xl-size)',
          lineHeight: 'var(--text-xl-line)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-primary)',
          marginBottom: '8px',
        }}
      >
        Something went wrong
      </h1>
      <p
        style={{
          fontSize: 'var(--text-md-size)',
          lineHeight: 'var(--text-md-line)',
          color: 'var(--text-muted)',
        }}
      >
        Try{' '}
        <button
          onClick={() => window.location.reload()}
          style={{
            color: 'var(--accent-primary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontSize: 'inherit',
          }}
        >
          reloading the page
        </button>
        .
      </p>
    </main>
  );
}
