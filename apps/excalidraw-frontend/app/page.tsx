import Image from "next/image";
import Link from "next/link";
import LogoutButton from "../components/LogoutButton";

// Simple SVG icons as React components
const PencilIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
  </svg>
);

const CloudIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
  </svg>
);

const LightningIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

// Hero image placeholder
const heroImage = "/api/placeholder/800/600";

// Features data
const features = [
  {
    icon: PencilIcon,
    title: "Natural Drawing",
    description: "Draw naturally with your mouse, touch, or pen. Our vector graphics feel like pen and paper."
  },
  {
    icon: UsersIcon,
    title: "Real-time Collaboration",
    description: "Work together with your team in real-time. See changes as they happen."
  },
  {
    icon: CloudIcon,
    title: "Cloud Sync",
    description: "Your diagrams are automatically saved and synced across all your devices."
  },
  {
    icon: LightningIcon,
    title: "Lightning Fast",
    description: "Built for speed and performance. Create complex diagrams without lag."
  }
];

// Client component for authentication-aware header
function AuthAwareHeader() {
  return (
    <header className="px-6 py-4">
      <nav className="mx-auto max-w-7xl flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">E</span>
          </div>
          <span className="text-xl font-semibold text-foreground">Excalidraw</span>
        </div>
        
        <div className="hidden md:flex items-center space-x-8">
          <a href="#features" className="text-muted-foreground hover:text-foreground transition-smooth">
            Features
          </a>
          <a href="#about" className="text-muted-foreground hover:text-foreground transition-smooth">
            About
          </a>
          <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-smooth">
            Pricing
          </a>
        </div>

        <div className="flex items-center space-x-3">
          <Link href="/signin" className="text-muted-foreground hover:text-foreground transition-smooth">
            Sign in
          </Link>
          <Link href="/signup" className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-smooth">
            Sign up
          </Link>
        </div>
      </nav>
    </header>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
    {/* Header */}
    <AuthAwareHeader />

    {/* Hero Section */}
    <section className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Virtual whiteboard for
            <span className="block gradient-primary bg-clip-text text-transparent">
              sketching hand-drawn
            </span>
            like diagrams
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
            Collaborative diagramming. Unleash your creativity with an infinite, 
            collaborative, and fast whiteboard built for teams and individuals.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <Link href="/signup" className="bg-primary text-primary-foreground px-6 py-3 rounded-md hover:bg-primary/90 transition-smooth min-w-[200px] text-center">
              Get started
            </Link>
            <Link href="/demo" className="border border-border text-foreground px-6 py-3 rounded-md hover:bg-accent transition-smooth min-w-[200px] text-center">
              Watch demo
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="gradient-card rounded-2xl p-8 shadow-large">
            <div className="canvas-mockup rounded-xl overflow-hidden shadow-medium">
              {/* <img 
                src={heroImage} 
                alt="Excalidraw whiteboard interface showing collaborative diagramming"
                className="w-full h-auto"
              /> */}
            </div>
          </div>
          
          {/* Floating elements for visual interest */}
          <div className="absolute -top-4 -left-4 w-12 h-12 bg-accent rounded-full shadow-soft animate-pulse"></div>
          <div className="absolute -bottom-6 -right-6 w-16 h-16 bg-primary/10 rounded-full shadow-soft"></div>
        </div>
      </div>
    </section>

    {/* Features Section */}
    <section id="features" className="px-6 py-16 md:py-24 gradient-hero">
      <div className="mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Everything you need to create
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Built with simplicity and collaboration in mind. Create beautiful diagrams 
            that feel natural and engaging.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="gradient-card rounded-xl p-6 shadow-medium hover:shadow-large transition-smooth"
            >
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <feature.icon />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer className="px-6 py-12 border-t border-border">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xs">E</span>
            </div>
            <span className="text-lg font-semibold text-foreground">Excalidraw</span>
          </div>
          
          <div className="flex items-center space-x-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-smooth">Privacy</a>
            <a href="#" className="hover:text-foreground transition-smooth">Terms</a>
            <a href="#" className="hover:text-foreground transition-smooth">GitHub</a>
            <a href="#" className="hover:text-foreground transition-smooth">Twitter</a>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          © 2024 Excalidraw. Made with ❤️ for visual thinkers.
        </div>
      </div>
    </footer>
  </div>
  );
}
