import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Menu, X, LogOut, User, Map } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface NavLink {
  name: string;
  href: string;
  icon: React.ElementType;
}

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const links: NavLink[] = [
    { name: 'Create', href: '/', icon: Sparkles },
    ...(isAuthenticated
      ? [
          { name: 'My Roadmaps', href: '/my-roadmaps', icon: Map },
          { name: 'Progress', href: '/progress', icon: User },
        ]
      : []),
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
  };

  // Shared auth block: user name + tier badge + sign out / sign in
  const authBlock = isAuthenticated ? (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm text-warm-200">
          {user?.name || user?.email?.split('@')[0]}
        </span>
        <Badge variant={user?.roles?.includes('pro') ? 'available' : 'secondary'} size="sm">
          {user?.roles?.includes('pro') ? 'Pro' : 'Free'}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleLogout}
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </>
  ) : (
    <Button
      variant="primary"
      size="sm"
      onClick={() => navigate('/login')}
      className="max-md:w-full"
    >
      Sign In
    </Button>
  );

  const renderLinks = (variant: 'desktop' | 'mobile') =>
    links.map((link) => (
      <Link
        key={link.href}
        to={link.href}
        onClick={variant === 'mobile' ? () => setMobileMenuOpen(false) : undefined}
        className={cn(
          'flex items-center gap-2 text-sm font-medium transition-colors',
          variant === 'desktop' ? 'px-3 py-1.5 rounded-full' : 'px-4 py-2 rounded-xl hover:bg-hearth-700',
          isActive(link.href)
            ? 'text-amber bg-amber/10'
            : variant === 'desktop'
              ? 'text-warm-200 hover:text-amber hover:bg-hearth-700'
              : 'text-warm-200'
        )}
      >
        <link.icon className="h-4 w-4" />
        {link.name}
      </Link>
    ));

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border-subtle bg-hearth-800/95 backdrop-blur supports-[backdrop-filter]:bg-hearth-800/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="relative">
              <Sparkles className="h-7 w-7 text-amber transition-transform group-hover:scale-110 duration-300" />
              <div className="absolute inset-0 rounded-full bg-amber/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex flex-col">
              <span className="font-heading font-bold text-lg leading-tight text-warm-50">
                Lucubrum
              </span>
              <span className="text-xs text-warm-400">Shape Your Path</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2">
            {renderLinks('desktop')}
            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border-moderate">
              {authBlock}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-warm-50 hover:text-amber transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border-moderate">
            <div className="flex flex-col gap-2">
              {renderLinks('mobile')}
              <div className="flex items-center justify-between px-4 py-2 mt-2 border-t border-border-moderate">
                {authBlock}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
