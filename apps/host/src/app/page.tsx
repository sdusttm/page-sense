"use client";
import { Cart } from '@/components/Cart';
import { ProductList } from '@/components/ProductList';
import { toast } from 'sonner';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">TechStore</h1>
            <nav className="hidden md:flex gap-6">
              <a href="#" className="text-sm font-medium text-gray-500 hover:text-gray-900">Furniture</a>
              <a href="#" className="text-sm font-medium text-gray-500 hover:text-gray-900">Electronics</a>
              <a href="#" className="text-sm font-medium text-gray-500 hover:text-gray-900">Accessories</a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search products..."
                className="pl-4 pr-10 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <Cart />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <section className="mb-12">
          <div className="bg-blue-600 rounded-2xl p-8 text-white relative overflow-hidden">
            <div className="relative z-10 max-w-xl">
              <h2 className="text-4xl font-bold mb-4">Upgrade Your Workspace</h2>
              <p className="text-lg text-blue-100 mb-6">Get 20% off all ergonomic furniture and premium electronics this week only.</p>
              <button onClick={() => toast.success('Applying 20% off discount... Navigating to sale.')} className="bg-white text-blue-600 px-6 py-3 rounded-full font-bold hover:bg-gray-100 transition shadow-lg">
                Shop the Sale
              </button>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Featured Products</h2>
            <div className="flex gap-2">
              <button className="text-sm font-medium text-gray-600 bg-gray-200 px-3 py-1 rounded-full">All</button>
              <button className="text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-1">New</button>
              <button className="text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-1">Popular</button>
            </div>
          </div>
          <ProductList />
        </section>

        <section className="mt-16 border-t border-gray-200 pt-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Subscribe to our newsletter</h2>
          <form className="max-w-md flex gap-2">
            <input type="email" placeholder="Enter your email" className="flex-1 border border-gray-300 rounded-md px-4 py-2" />
            <button type="button" onClick={() => toast.success('Subscribed to newsletter!')} className="bg-black text-white px-6 py-2 rounded-md font-medium">Subscribe</button>
          </form>
        </section>
      </main>

      <footer className="bg-white border-t border-gray-200 py-12 mt-12 pb-32">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          &copy; 2024 TechStore. Built for Page Sense tracking demo.
        </div>
      </footer>
    </div>
  );
}
