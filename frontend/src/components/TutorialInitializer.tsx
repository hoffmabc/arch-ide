import { useEffect, useState } from 'react';
import { useTutorial } from '../context/TutorialContext';
import { storage } from '../utils/storage';
import { WelcomeModal } from './WelcomeModal';

export const TutorialInitializer: React.FC = () => {
  const { startTutorial, skipTutorial } = useTutorial();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Check if the user has completed the tutorial
    const hasCompletedTutorial = storage.getHasCompletedTutorial();
    if (!hasCompletedTutorial) {
      setShowWelcome(true);
    }

    console.log('TutorialInitializer mounted, showWelcome:', !hasCompletedTutorial);
  }, []);

  const handleStart = () => {
    console.log('Starting tutorial...');
    startTutorial();
    setShowWelcome(false);
  };

  const handleSkip = () => {
    console.log('Skipping tutorial...');
    skipTutorial();
    setShowWelcome(false);
  };

  return (
    <WelcomeModal
      isOpen={showWelcome}
      onStart={handleStart}
      onSkip={handleSkip}
    />
  );
};