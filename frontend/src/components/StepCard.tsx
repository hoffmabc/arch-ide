import React from 'react';

interface StepCardProps {
  step: number;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const StepCard: React.FC<StepCardProps> = ({ step, title, actions, children }) => {
  return (
    <section className="rounded-md border border-gray-700/60 bg-gray-800/50 p-4 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-gray-700 text-gray-200 flex items-center justify-center text-xs font-semibold">
            {step}
          </div>
          <h3 className="text-[15px] font-semibold tracking-wide uppercase text-gray-200">{title}</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
};

export default StepCard;
