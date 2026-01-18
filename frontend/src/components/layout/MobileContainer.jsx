import { clsx } from 'clsx';

export const MobileContainer = ({ children, className }) => {
    return (
        <div className="min-h-[100dvh] bg-background dark:bg-slate-900 flex justify-center">
            <div
                className={clsx(
                    "w-full max-w-lg bg-background dark:bg-slate-900 h-[100dvh] relative overflow-hidden",
                    className
                )}
                style={{
                    paddingTop: 'var(--safe-area-top)',
                    paddingLeft: 'var(--safe-area-left)',
                    paddingRight: 'var(--safe-area-right)',
                }}
            >
                {children}
            </div>
        </div>
    );
};
