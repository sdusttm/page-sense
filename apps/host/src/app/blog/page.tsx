export default function Blog() {
    return (
        <div className="min-h-screen bg-stone-50 font-serif text-stone-900">
            <header className="border-b border-stone-200 bg-white">
                <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="text-3xl font-black tracking-tighter">The Daily Post</div>
                    <nav className="space-x-4 text-sm font-sans font-medium text-stone-500">
                        <a href="#" className="hover:text-stone-900 transition">Design</a>
                        <a href="#" className="hover:text-stone-900 transition">Tech</a>
                        <a href="#" className="hover:text-stone-900 transition">Culture</a>
                    </nav>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
                <article className="lg:col-span-8">
                    <div className="mb-8">
                        <span className="text-sm font-bold tracking-widest text-emerald-600 uppercase">Design Philosophy</span>
                        <h1 className="text-5xl font-bold mt-3 mb-6 leading-tight">Why Minimalism Still Works in Modern Web Design</h1>
                        <div className="flex items-center gap-4 text-stone-500 font-sans text-sm">
                            <img src="https://via.placeholder.com/40" alt="Author" className="w-10 h-10 rounded-full" />
                            <div>
                                <p className="font-bold text-stone-800">Jane Doe</p>
                                <p>October 24, 2024</p>
                            </div>
                        </div>
                    </div>

                    <img src="https://via.placeholder.com/800x400" alt="Minimalist Workspace" className="w-full rounded-xl mb-10 object-cover" />

                    <div className="prose prose-stone lg:prose-xl max-w-none">
                        <p className="lead text-xl text-stone-600 mb-6">
                            In an era of increasingly complex digital experiences, the principles of minimalism remain a powerful tool for clarity and focus.
                        </p>
                        <p className="mb-6">
                            Design is not just what it looks like and feels like. Design is how it works. When we strip away the unnecessary, we are left with the essential. This fundamental truth is why minimalist design continues to dominate modern web aesthetics.
                        </p>
                        <blockquote className="border-l-4 border-emerald-500 pl-6 italic text-stone-600 mb-6 my-8 text-2xl">
                            "Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away." — Antoine de Saint-Exupéry
                        </blockquote>
                        <h2 className="text-3xl font-bold mt-10 mb-4">The Core Tenets</h2>
                        <ul className="list-disc pl-6 mb-6 space-y-2">
                            <li><strong>Negative Space:</strong> Allowing content to breathe.</li>
                            <li><strong>Typography as Design:</strong> Using large, clear fonts to convey hierarchy.</li>
                            <li><strong>Intentional Color:</strong> Limiting palettes to a few purposeful colors to guide attention.</li>
                        </ul>
                        <p>
                            By focusing on these elements, we create interfaces that don't overwhelm the user, but rather invite them to engage with the content gracefully.
                        </p>
                    </div>
                </article>

                <aside className="lg:col-span-4 font-sans space-y-10">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
                        <h3 className="font-bold text-lg mb-4 text-stone-900 border-b pb-2">About the Author</h3>
                        <p className="text-sm text-stone-600 mb-4">Jane Doe is a lead designer at Studio X, focusing on user-centered sustainable design practices.</p>
                        <button className="w-full py-2 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-700 transition">Follow Jane</button>
                    </div>

                    <div>
                        <h3 className="font-bold text-lg mb-4 text-stone-900 border-b pb-2">Related Articles</h3>
                        <div className="space-y-4">
                            <a href="#" className="group block">
                                <h4 className="font-medium text-stone-800 group-hover:text-emerald-600 transition">The Future of Typography in CSS</h4>
                                <p className="text-xs text-stone-500 mt-1">October 12, 2024</p>
                            </a>
                            <a href="#" className="group block">
                                <h4 className="font-medium text-stone-800 group-hover:text-emerald-600 transition">Accessibility First: A New Standard</h4>
                                <p className="text-xs text-stone-500 mt-1">September 28, 2024</p>
                            </a>
                            <a href="#" className="group block">
                                <h4 className="font-medium text-stone-800 group-hover:text-emerald-600 transition">Grid vs Flexbox in 2024</h4>
                                <p className="text-xs text-stone-500 mt-1">September 15, 2024</p>
                            </a>
                        </div>
                    </div>
                </aside>
            </main>

            <footer className="bg-stone-900 text-stone-400 py-12 text-center mt-12 pb-24 font-sans text-sm">
                <p>&copy; 2024 The Daily Post. All rights reserved.</p>
            </footer>
        </div>
    );
}
