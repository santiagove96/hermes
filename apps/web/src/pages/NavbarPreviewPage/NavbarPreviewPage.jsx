import { GlobeSimple, List } from '@phosphor-icons/react';
import Navbar from '../../components/ui/Navbar';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import styles from './NavbarPreviewPage.module.css';

function MenuButton() {
  return (
    <Button variant="outline" size="sm" iconOnly aria-label="Menú">
      <List size={16} weight="regular" />
    </Button>
  );
}

function PublishButton() {
  return (
    <Button variant="outline" size="sm" iconOnly aria-label="Publicar">
      <GlobeSimple size={16} weight="regular" />
    </Button>
  );
}

export default function NavbarPreviewPage() {
  return (
    <main className={styles.page}>
      <div className={styles.stack}>
        <Navbar
          variant="homepage"
          accountControl={<Avatar size="small" variant="text" badge={false} label="SV" />}
          mobileMenuControl={<MenuButton />}
        />
        <Navbar
          variant="notLogged"
          title="Title"
          wordCount={800}
          wordLabel="Palabras"
          mobileMenuControl={<MenuButton />}
        />
        <Navbar
          variant="project"
          title="Title"
          wordCount={800}
          wordLabel="Palabras"
          trainItems={[
            { label: 'Q&A' },
            { label: 'Tarjetas' },
          ]}
          publishControl={<PublishButton />}
          accountControl={<Avatar size="small" variant="text" badge={false} label="SV" />}
          mobileMenuControl={<MenuButton />}
        />
      </div>
    </main>
  );
}
