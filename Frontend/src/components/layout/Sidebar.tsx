import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Bot,
    Heart,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
    path: string;
    label: string;
    icon: React.ReactNode;
    disabled?: boolean;
}

const navItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/rpas', label: 'RPAs', icon: <Bot size={20} /> },
    { path: '/heartbeat', label: 'Heartbeat', icon: <Heart size={20} />, disabled: true },
];

export function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <aside
            className={`
        glass-low flex flex-col h-screen sticky top-0
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-56'}
      `}
        >
            {/* Logo */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--glass-border)]">
                {!collapsed && (
                    <h1 className="text-lg font-bold gradient-text animate-fadeIn">
                        DockerWatcher
                    </h1>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-2 rounded-lg hover:bg-white/5 text-[var(--color-text-muted)]
                     transition-all duration-200"
                >
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 overflow-y-auto">
                <ul className="space-y-2 px-3">
                    {navItems.map((item) => (
                        <li key={item.path}>
                            {item.disabled ? (
                                <div
                                    className={`
                    flex items-center gap-3 px-3 py-3 rounded-xl
                    text-[var(--color-text-subtle)] cursor-not-allowed opacity-50
                    ${collapsed ? 'justify-center' : ''}
                  `}
                                    title={collapsed ? item.label : 'Em breve'}
                                >
                                    {item.icon}
                                    {!collapsed && (
                                        <span className="text-sm font-medium">{item.label}</span>
                                    )}
                                </div>
                            ) : (
                                <NavLink
                                    to={item.path}
                                    className={({ isActive }) => `
                    flex items-center gap-3 px-3 py-3 rounded-xl
                    transition-all duration-200 group
                    ${isActive
                                            ? 'glass-high text-white glow-primary'
                                            : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text)]'
                                        }
                    ${collapsed ? 'justify-center' : ''}
                  `}
                                    title={collapsed ? item.label : undefined}
                                >
                                    <span className="transition-transform duration-200 group-hover:scale-110">
                                        {item.icon}
                                    </span>
                                    {!collapsed && (
                                        <span className="text-sm font-medium animate-fadeIn">
                                            {item.label}
                                        </span>
                                    )}
                                </NavLink>
                            )}
                        </li>
                    ))}
                </ul>
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--glass-border)]">
                {!collapsed && (
                    <div className="text-xs text-[var(--color-text-subtle)] animate-fadeIn">
                        v2.0.0
                    </div>
                )}
            </div>
        </aside>
    );
}
