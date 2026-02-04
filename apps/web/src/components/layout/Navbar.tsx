import { Link, useLocation } from 'react-router-dom';
import { Compass, Menu, X, LogOut, User, Map } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function Navbar() {
  const location = useLocation();
  const { user, isAuthenticated, logout, login } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Chart a Course', href: '/', icon: Compass },
  ];

  const protectedLinks = isAuthenticated
    ? [
        { name: 'My Roadmaps', href: '/my-roadmaps', icon: Map },
        { name: 'Progress', href: '/progress', icon: User },
      ]
    : [];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const handleLogin = () => {
    login();
  };

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gold/20 bg-parchment/95 backdrop-blur supports-[backdrop-filter]:bg-parchment/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo - "The Helm" */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="relative">
              <Compass className="h-8 w-8 text-gold transition-transform group-hover:rotate-45 duration-300" />
              <div className="absolute inset-0 rounded-full bg-gold/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity compass-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="font-heading font-bold text-lg leading-tight text-ink">
                Learning Helper
              </span>
              <span className="text-xs text-gold-muted">Chart Your Course</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-gold ${
                  isActive(link.href) ? 'text-gold' : 'text-ink/70'
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.name}
              </Link>
            ))}

            {protectedLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-gold ${
                  isActive(link.href) ? 'text-gold' : 'text-ink/70'
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.name}
              </Link>
            ))}

            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gold/20">
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-ink/70">
                    {user?.name || user?.email?.split('@')[0]}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLogout}
                    title="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" onClick={handleLogin}>
                  Sign In
                </Button>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-ink hover:text-gold transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gold/20">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-gold/10 ${
                    isActive(link.href) ? 'text-gold bg-gold/10' : 'text-ink/70'
                  }`}
                >
                  <link.icon className="h-4 w-4" />
                  {link.name}
                </Link>
              ))}

              {protectedLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-gold/10 ${
                    isActive(link.href) ? 'text-gold bg-gold/10' : 'text-ink/70'
                  }`}
                >
                  <link.icon className="h-4 w-4" />
                  {link.name}
                </Link>
              ))}

              <div className="flex items-center justify-between px-4 py-2 mt-2 border-t border-gold/20">
                {isAuthenticated ? (
                  <>
                    <span className="text-sm text-ink/70">
                      {user?.name || user?.email?.split('@')[0]}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleLogout}
                      title="Sign out"
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" size="sm" onClick={handleLogin} className="w-full">
                    Sign In
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
