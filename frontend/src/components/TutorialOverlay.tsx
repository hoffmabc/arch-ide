import React, { useEffect, useState } from 'react';
import { useTutorial } from './TutorialContext';
import { Portal } from '@radix-ui/react-portal';

export const TutorialOverlay: React.FC = () => {
  const { isActive, currentStep, steps, nextStep, previousStep, skipTutorial } = useTutorial();
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isActive) return;

    const updatePosition = () => {
      const target = document.querySelector(steps[currentStep].target);
      if (target) {
        const rect = target.getBoundingClientRect();
        const placement = steps[currentStep].placement || 'bottom';

        let top = rect.top;
        let left = rect.left;

        // Adjust position based on placement
        switch (placement) {
          case 'bottom':
            top = rect.bottom + 10;
            left = rect.left + (rect.width / 2) - 150;
            break;
          case 'top':
            top = rect.top - 10;
            left = rect.left + (rect.width / 2) - 150;
            break;
          // Add other placement calculations as needed
        }

        setPosition({ top, left });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [isActive, currentStep, steps]);

  if (!isActive) return null;

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/50 z-50">
        <div
          className="absolute bg-white rounded-lg shadow-lg p-4 w-[300px]"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          <h3 className="text-lg font-semibold">{steps[currentStep].title}</h3>
          <p className="mt-2">{steps[currentStep].content}</p>

          <div className="mt-4 flex justify-between">
            <button
              onClick={previousStep}
              disabled={currentStep === 0}
              className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={skipTutorial}
              className="px-3 py-1 rounded bg-gray-200"
            >
              Skip
            </button>
            <button
              onClick={nextStep}
              className="px-3 py-1 rounded bg-blue-500 text-white"
            >
              {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};