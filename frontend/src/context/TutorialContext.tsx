import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '../utils/storage';

export type TutorialStep = {
  target: string;  // CSS selector for the target element
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void | Promise<void>;
  waitForAction?: boolean;
};

interface TutorialContextType {
  isActive: boolean;
  currentStep: number;
  steps: TutorialStep[];
  startTutorial: () => void;
  endTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const steps: TutorialStep[] = [
    {
      target: '[data-tutorial="create-project-button"]',
      title: 'Create New Project',
      content: 'Click the "Create New Project" button to start building your first Arch Network program.',
      placement: 'bottom',
    },
    {
      target: '[data-tutorial="build-tab"]',
      title: 'Build Your Project',
      content: 'Once your project is created, click the Build tab to compile your program.',
      placement: 'right',
    },
    {
      target: '[data-tutorial="generate-key"]',
      title: 'Generate Program Key',
      content: 'Generate a new program key that will be used for deployment.',
      placement: 'right',
    },
    {
      target: '[data-tutorial="deploy"]',
      title: 'Deploy Your Program',
      content: 'Finally, deploy your program to the Arch Network.',
      placement: 'right',
    }
  ];

  const startTutorial = () => {
    setIsActive(true);
    setCurrentStep(0);
  };

  const endTutorial = () => {
    setIsActive(false);
    storage.saveHasCompletedTutorial(true);
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      endTutorial();
    }
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const skipTutorial = () => {
    storage.saveHasCompletedTutorial(true);
    setIsActive(false);
  };

  return (
    <TutorialContext.Provider
      value={{
        isActive,
        currentStep,
        steps,
        startTutorial,
        endTutorial,
        nextStep,
        previousStep,
        skipTutorial,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};