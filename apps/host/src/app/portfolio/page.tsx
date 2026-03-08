export default function Portfolio() {
    return (
        <div className="min-h-screen bg-black text-white selection:bg-fuchsia-500 selection:text-white">
            {/* Header */}
            <header className="fixed top-12 left-0 w-full z-40 bg-black/50 backdrop-blur-md border-b border-white/10">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="text-xl font-bold tracking-widest uppercase">Alex<span className="text-fuchsia-500">.</span>Dev</div>
                    <nav className="hidden md:flex gap-8 text-sm font-medium">
                        <a href="#work" className="hover:text-fuchsia-400 transition">Work</a>
                        <a href="#about" className="hover:text-fuchsia-400 transition">About</a>
                        <a href="#contact" className="hover:text-fuchsia-400 transition">Contact</a>
                    </nav>
                </div>
            </header>

            <main>
                {/* Hero Section */}
                <section className="min-h-screen flex items-center justify-center pt-24 pb-12 px-6">
                    <div className="max-w-4xl mx-auto text-center space-y-8">
                        <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-tight bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
                            Creative Developer <br /> & UI Engineer
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto font-light">
                            I build immersive digital experiences that blur the line between design and engineering. Currently based in San Francisco.
                        </p>
                        <div className="flex justify-center gap-4 pt-8">
                            <button className="px-8 py-4 bg-fuchsia-600 text-white rounded-full font-bold hover:bg-fuchsia-500 transition shadow-lg shadow-fuchsia-600/20">
                                View My Work
                            </button>
                            <button className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-full font-bold hover:bg-white/10 transition">
                                Contact Me
                            </button>
                        </div>
                    </div>
                </section>

                {/* Selected Work */}
                <section id="work" className="py-24 px-6 border-t border-white/10">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex items-en justify-between mb-16">
                            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Selected Work</h2>
                            <a href="#" className="hidden md:inline-block text-fuchsia-500 hover:text-fuchsia-400 font-medium">View All Projects &rarr;</a>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                            <div className="group cursor-pointer">
                                <div className="bg-white/5 rounded-2xl overflow-hidden mb-6 aspect-video border border-white/10 relative">
                                    <div className="absolute inset-0 flex items-center justify-center opacity-50 group-hover:opacity-100 transition duration-500">
                                        <span className="text-6xl tracking-widest font-black text-white/20">AURA</span>
                                    </div>
                                </div>
                                <h3 className="text-2xl font-bold mb-2 group-hover:text-fuchsia-400 transition">Aura Music Player</h3>
                                <p className="text-gray-400">Design & Frontend Development</p>
                            </div>

                            <div className="group cursor-pointer">
                                <div className="bg-white/5 rounded-2xl overflow-hidden mb-6 aspect-video border border-white/10 relative">
                                    <div className="absolute inset-0 flex items-center justify-center opacity-50 group-hover:opacity-100 transition duration-500">
                                        <span className="text-6xl tracking-widest font-black text-white/20">NEXUS</span>
                                    </div>
                                </div>
                                <h3 className="text-2xl font-bold mb-2 group-hover:text-fuchsia-400 transition">Nexus Finance Dashboard</h3>
                                <p className="text-gray-400">Fullstack Engineering</p>
                            </div>

                            <div className="group cursor-pointer">
                                <div className="bg-white/5 rounded-2xl overflow-hidden mb-6 aspect-video border border-white/10 relative">
                                    <div className="absolute inset-0 flex items-center justify-center opacity-50 group-hover:opacity-100 transition duration-500">
                                        <span className="text-6xl tracking-widest font-black text-white/20">LUMI</span>
                                    </div>
                                </div>
                                <h3 className="text-2xl font-bold mb-2 group-hover:text-fuchsia-400 transition">Lumi Smart Home App</h3>
                                <p className="text-gray-400">iOS & React Native</p>
                            </div>

                            <div className="group cursor-pointer">
                                <div className="bg-white/5 rounded-2xl overflow-hidden mb-6 aspect-video border border-white/10 relative">
                                    <div className="absolute inset-0 flex items-center justify-center opacity-50 group-hover:opacity-100 transition duration-500">
                                        <span className="text-6xl tracking-widest font-black text-white/20">STRT</span>
                                    </div>
                                </div>
                                <h3 className="text-2xl font-bold mb-2 group-hover:text-fuchsia-400 transition">Streetwear E-commerce</h3>
                                <p className="text-gray-400">Shopify Headless Build</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Contact Form */}
                <section id="contact" className="py-24 px-6 border-t border-white/10 bg-white/5">
                    <div className="max-w-3xl mx-auto text-center">
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Let's build something together.</h2>
                        <p className="text-gray-400 text-lg mb-12">I'm currently available for freelance projects and open to full-time opportunities.</p>

                        <form className="space-y-6 text-left">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Name</label>
                                    <input type="text" className="w-full bg-black border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition" placeholder="John Doe" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
                                    <input type="email" className="w-full bg-black border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition" placeholder="john@example.com" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Message</label>
                                <textarea rows={5} className="w-full bg-black border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition" placeholder="Tell me about your project..."></textarea>
                            </div>
                            <button type="button" className="w-full py-4 bg-fuchsia-600 text-white rounded-lg font-bold hover:bg-fuchsia-500 transition">
                                Send Message
                            </button>
                        </form>
                    </div>
                </section>
            </main>

            <footer className="border-t border-white/10 py-12 px-6 pb-32">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="text-xl font-bold tracking-widest uppercase">Alex<span className="text-fuchsia-500">.</span>Dev</div>
                    <div className="text-gray-500 text-sm">
                        &copy; 2024 Alex Developer. Built for Page Sense tracking demo.
                    </div>
                    <div className="flex gap-4">
                        <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">𝕏</a>
                        <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">in</a>
                        <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">Gh</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
