import { Home, FileText, PlusCircle } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';

// eslint-disable-next-line no-unused-vars -- Icon is used in JSX below
const NavItem = ({ to, icon: Icon }) => (
    <NavLink
        to={to}
        className="group flex items-center justify-center"
    >
        {({ isActive }) => (
            <div className={clsx(
                "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300",
                isActive ? "bg-primary text-white shadow-md ring-4 ring-primary/20 dark:bg-sky-500 dark:ring-sky-900/50" : "text-slate-400 group-hover:bg-slate-50 dark:text-slate-500 dark:group-hover:bg-slate-700"
            )}>
                <Icon
                    className="w-6 h-6 transition-all"
                    strokeWidth={2}
                />
            </div>
        )}
    </NavLink>
);

export const Navbar = () => {
    return (
        <nav
            className="absolute left-4 right-4 bg-white/80 backdrop-blur-lg border border-slate-100 px-6 rounded-2xl shadow-lg z-30 dark:bg-slate-800/90 dark:border-slate-700"
            style={{ bottom: 'calc(1.5rem + var(--safe-area-bottom, 0))' }}
        >
            <div className="flex items-center justify-between h-16 max-w-sm mx-auto">
                <NavItem to="/" icon={Home} />
                <NavLink to="/notes/new" className={({ isActive }) => clsx(
                    "flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-transform active:scale-95",
                    isActive ? "bg-primary text-white ring-4 ring-primary/20 dark:bg-sky-500 dark:ring-sky-900/50" : "bg-white text-primary border border-slate-100 dark:bg-slate-700 dark:text-sky-400 dark:border-slate-600"
                )}>
                    <PlusCircle className="w-7 h-7" />
                </NavLink>
                <NavItem to="/notes" icon={FileText} />
            </div>
        </nav>
    );
};
