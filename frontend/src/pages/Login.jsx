import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ArrowRight, Moon, Sun, Zap } from 'lucide-react';
import { logger } from '../utils/logger';
import { getVersionString } from '../utils/appConfig';
import { MobileContainer } from '../components/layout/MobileContainer';

const Login = () => {
    const { loginEmail, signup, user } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const [isSignup, setIsSignup] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (user) {
            navigate('/');
        }
    }, [user, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isSignup) {
                await signup(email, password);
            } else {
                await loginEmail(email, password);
            }
        } catch (err) {
            logger.error('Auth error:', err);
            if (err.code === 'auth/invalid-credential') {
                setError('Invalid email or password.');
            } else if (err.code === 'auth/email-already-in-use') {
                setError('Email is already in use.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password should be at least 6 characters.');
            } else {
                setError('Failed to ' + (isSignup ? 'create account' : 'log in'));
            }
        }

        setLoading(false);
    };

    return (
        <MobileContainer>
            <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-slate-50 animate-fadeIn dark:bg-slate-900 relative">
                {/* Version string */}
                <div className="absolute left-1/2 top-4 -translate-x-1/2">
                    <p className="text-slate-400 font-mono text-[10px] dark:text-slate-500">{getVersionString()}</p>
                </div>

                {/* Dark Mode Toggle */}
                <button
                    onClick={toggleTheme}
                    className="absolute top-4 right-4 p-3 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95 transition-all shadow-lg dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                    aria-label="Toggle dark mode"
                >
                    {isDark ? (
                        <Sun className="w-5 h-5" />
                    ) : (
                        <Moon className="w-5 h-5" />
                    )}
                </button>

                <Card className="w-full max-w-md p-8 shadow-xl bg-white border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg">
                            <Zap className="w-6 h-6" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                        Welcome
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        Sign in to continue
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500"
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500"
                        />
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        className="w-full h-12 mt-2 shadow-lg shadow-sky-200 text-lg"
                        disabled={loading}
                    >
                        {loading ? 'Processing...' : (isSignup ? 'Create Account' : 'Sign In')}
                        {!loading && <ArrowRight className="w-5 h-5 ml-2" />}
                    </Button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-100 text-center dark:border-slate-700">
                    <p className="text-slate-500 text-sm mb-3 dark:text-slate-400">
                        {isSignup ? 'Already have an account?' : "Don't have an account?"}
                    </p>
                    <Button
                        variant="ghost"
                        className="w-full hover:bg-slate-50 text-slate-600 dark:hover:bg-slate-700 dark:text-slate-300"
                        onClick={() => setIsSignup(!isSignup)}
                    >
                        {isSignup ? 'Sign In' : 'Create Account'}
                    </Button>
                </div>
            </Card>
            </div>
        </MobileContainer>
    );
};

export default Login;
