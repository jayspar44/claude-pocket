import React from 'react';
import { cn } from '../../utils/cn';

const Card = React.forwardRef(({ className, ...props }, ref) => {
    return (
        <div
            ref={ref}
            className={cn(
                'bg-surface rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200',
                'dark:bg-slate-800 dark:border-slate-700 dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]',
                className
            )}
            {...props}
        />
    );
});

Card.displayName = 'Card';

export default Card;
