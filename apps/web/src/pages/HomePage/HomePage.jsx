import { useState } from 'react';
import Navbar from '../../components/ui/Navbar';
import useAuth from '../../hooks/useAuth';
import styles from './HomePage.module.css';

const HOME_TITLE = 'Bienvenido a Diles';
const HOME_SUBTITLE = 'Diles es un editor simple que te ayuda a escribir mejor y compartir tus ideas con mayor claridad. Empieza con lo que ya tienes. Termina con algo que vale la pena leer y decir.';

export default function HomePage() {
  const { signInWithGoogle } = useAuth();
  const [authError, setAuthError] = useState('');

  const handleGoogleAuth = async (intent) => {
    setAuthError('');
    try {
      await signInWithGoogle(intent);
    } catch (err) {
      setAuthError(err?.message || 'No se pudo abrir Google. Intenta de nuevo.');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.navbarWrap}>
        <Navbar
          variant="notLogged"
          title={HOME_TITLE}
          onSignIn={() => handleGoogleAuth('login')}
          onSignUp={() => handleGoogleAuth('signup')}
        />
      </div>

      <article className={styles.article}>
        <header className={styles.header}>
          <h1 className={styles.title}>{HOME_TITLE}</h1>
          <p className={styles.subtitle}>{HOME_SUBTITLE}</p>
          {authError ? <p className={styles.subtitle}>{authError}</p> : null}
        </header>
        <div className={styles.body}>
          <h2>Muchas personas tienen ideas. Pocas las escriben bien.</h2>
          <ol>
            <li>Apuntes en papel.</li>
            <li>Notas en el celular.</li>
            <li>Documentos sin terminar.</li>
          </ol>
          <p>El problema no es la falta de contenido. Es la falta de estructura.</p>
          <p>Aquí puedes convertir ideas sueltas en artículos claros y compartibles.</p>

          <hr />

          <h2>Un editor pensado para claridad</h2>
          <p>No es un documento vacío. Es un espacio diseñado para ayudarte a:</p>
          <ul>
            <li>Organizar ideas en secciones.</li>
            <li>Separar argumentos.</li>
            <li>Detectar frases largas.</li>
            <li>Convertir borradores en textos comprensibles.</li>
          </ul>
          <p>No es escribir más. Es escribir mejor.</p>

          <hr />

          <h2>AI que propone mejores formas de decirlo</h2>
          <p>La inteligencia artificial no escribe por ti. Trabaja sobre tu texto y propone:</p>
          <ul>
            <li>Versiones más claras de una frase.</li>
            <li>Estructuras alternativas.</li>
            <li>Mejores títulos.</li>
            <li>Resúmenes más directos.</li>
            <li>Preguntas que tu lector podría hacer.</li>
          </ul>
          <p>Tú decides qué cambiar. La AI solo te muestra posibilidades.</p>

          <hr />

          <h2>Escribe y comparte con intención</h2>
          <p>Un texto mejora cuando se comparte. Aquí puedes:</p>
          <ul>
            <li>Publicar tus artículos.</li>
            <li>Compartirlos fácilmente.</li>
            <li>Usarlos como base para comunicarte con mayor claridad.</li>
          </ul>
          <p>Escribir no es solo guardar ideas. Es ordenarlas para que otros las entiendan.</p>
        </div>
      </article>
    </div>
  );
}
