import React, { useEffect, useState } from 'react';
import { useTutorial } from '../context/TutorialContext';
import { Portal } from '@radix-ui/react-portal';
import { Button } from '@/components/ui/button';
import styled, { keyframes } from 'styled-components';

const pulse = keyframes`
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0.7;
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
`;

const IndicatorDot = styled.div<{ top: number; left: number }>`
  position: absolute;
  width: 16px;
  height: 16px;
  background-color: #F7931A;
  border-radius: 50%;
  border: 2px solid rgba(247, 147, 26, 0.3);
  box-shadow: 0 0 12px rgba(247, 147, 26, 0.7);
  z-index: 49;
  top: ${props => props.top}px;
  left: ${props => props.left}px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: ${pulse} 1.5s ease-in-out infinite;
`;

export const TutorialOverlay: React.FC = () => {
  const { isActive, currentStep, steps, nextStep, previousStep, skipTutorial } = useTutorial();
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState({ top: 0, left: 0, direction: 'down' });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setIsVisible(false);
      return;
    }

    const updatePosition = () => {
      const target = document.querySelector(steps[currentStep].target);

      if (!target) {
        setIsVisible(false);
        setPosition({ top: 20, left: 20 });
        return;
      }

      const rect = target.getBoundingClientRect();
      const placement = steps[currentStep].placement || 'bottom';

      // Calculate tooltip position relative to target
      const tooltipWidth = 300;
      const tooltipHeight = 150;
      const spacing = 20;

      let top, left, arrowDir;

      // Position tooltip based on placement but ensure it doesn't overlap the target
      switch (placement) {
        case 'bottom':
          top = rect.bottom + spacing;
          left = Math.max(
            20,
            rect.left + (rect.width / 2) - (tooltipWidth / 2)
          );
          left = Math.min(left, window.innerWidth - tooltipWidth - 20);
          arrowDir = 'up';
          break;
        case 'top':
          top = Math.max(20, rect.top - tooltipHeight - spacing);
          left = Math.max(
            20,
            rect.left + (rect.width / 2) - (tooltipWidth / 2)
          );
          left = Math.min(left, window.innerWidth - tooltipWidth - 20);
          arrowDir = 'down';
          break;
        case 'left':
          top = Math.max(20, rect.top + (rect.height / 2) - (tooltipHeight / 2));
          left = Math.max(20, rect.left - tooltipWidth - spacing);
          top = Math.min(top, window.innerHeight - tooltipHeight - 20);
          arrowDir = 'right';
          break;
        case 'right':
          top = Math.max(20, rect.top + (rect.height / 2) - (tooltipHeight / 2));
          left = rect.right + spacing;
          left = Math.min(left, window.innerWidth - tooltipWidth - 20);
          top = Math.min(top, window.innerHeight - tooltipHeight - 20);
          arrowDir = 'left';
          break;
      }

      setPosition({ top, left });
      setArrowPosition({
        top: rect.top + rect.height / 2,
        left: rect.left + rect.width / 2,
        direction: arrowDir as 'up' | 'down' | 'left' | 'right'
      });
      setIsVisible(true);
    };

    const retryInterval = setInterval(() => {
      const target = document.querySelector(steps[currentStep].target);
      if (target) {
        updatePosition();
        clearInterval(retryInterval);
      }
    }, 100);

    updatePosition();
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      clearInterval(retryInterval);
    };
  }, [isActive, currentStep, steps]);

  if (!isActive || !isVisible) return null;

  return (
    <Portal container={document.body}>
      <IndicatorDot
        top={arrowPosition.top}
        left={arrowPosition.left}
      />
      <div
        className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 w-[300px]"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: 9999,
        }}
      >
        <h3 className="text-lg font-semibold dark:text-white">{steps[currentStep].title}</h3>
        <p className="mt-2 text-gray-600 dark:text-gray-300">{steps[currentStep].content}</p>

        <div className="mt-4 flex justify-between">
          <Button
            variant="outline"
            onClick={previousStep}
            disabled={currentStep === 0}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={skipTutorial}
          >
            Skip
          </Button>
          <Button
            variant="default"
            onClick={nextStep}
          >
            {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </Portal>
  );
};