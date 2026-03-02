import Avatar from '../../components/ui/Avatar';
import styles from './AvatarPreviewPage.module.css';

const sizes = ['large', 'medium', 'small', 'xsmall'];

export default function AvatarPreviewPage() {
  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <p className={styles.eyebrow}>UI Preview</p>
        <h1 className={styles.title}>Avatar</h1>
        <p className={styles.subtitle}>
          Preview visual del componente `Avatar` en variantes `text` y `pic`,
          con todos los tamaños y estados de badge.
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Text</h2>
        </div>

        <div className={styles.grid}>
          {sizes.map((size) => (
            <div key={`text-${size}`} className={styles.card}>
              <div className={styles.label}>{`text / ${size}`}</div>
              <div className={styles.row}>
                <Avatar size={size} variant="text" label="SV" badge={size !== 'xsmall'} online />
                <Avatar size={size} variant="text" label="SV" badge={size !== 'xsmall'} online={false} />
                <Avatar size={size} variant="text" label="SV" badge={false} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Pic</h2>
        </div>

        <div className={styles.grid}>
          {sizes.map((size) => (
            <div key={`pic-${size}`} className={styles.card}>
              <div className={styles.label}>{`pic / ${size}`}</div>
              <div className={styles.row}>
                <Avatar
                  size={size}
                  variant="pic"
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
                  alt="Profile"
                  badge={size !== 'xsmall'}
                  online
                />
                <Avatar
                  size={size}
                  variant="pic"
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
                  alt="Profile"
                  badge={size !== 'xsmall'}
                  online={false}
                />
                <Avatar
                  size={size}
                  variant="pic"
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
                  alt="Profile"
                  badge={false}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
