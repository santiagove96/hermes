import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchHomeEssay, getFallbackHomeEssay } from '@hermes/api';
import Navbar from '../../components/ui/Navbar';
import MarkdownText from '../../components/MarkdownText/MarkdownText';
import { getSingleCanvasPublishedContent } from '../../lib/singleCanvas';
import styles from './HomePage.module.css';

export default function HomePage() {
  const navigate = useNavigate();
  const [homeEssay, setHomeEssay] = useState(() => getFallbackHomeEssay());

  useEffect(() => {
    let active = true;

    fetchHomeEssay()
      .then((essay) => {
        if (active) setHomeEssay(essay);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const homeContent = getSingleCanvasPublishedContent(homeEssay.pages, homeEssay.publishedTabs);

  return (
    <div className={styles.page}>
      <div className={styles.navbarWrap}>
        <Navbar
          variant="notLogged"
          title={homeEssay.title || 'Bienvenido a Diles'}
          onSignIn={() => navigate('/login')}
          onSignUp={() => navigate('/signup')}
        />
      </div>

      <article className={styles.article}>
        <header className={styles.header}>
          <h1 className={styles.title}>{homeEssay.title}</h1>
          <p className={styles.subtitle}>{homeEssay.subtitle}</p>
        </header>
        <div className={styles.body}>
          <MarkdownText value={homeContent} />
        </div>
      </article>
    </div>
  );
}
