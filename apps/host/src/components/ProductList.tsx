"use client";
import { products } from '../data/products';
import { toast } from 'sonner';

export function ProductList() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((product) => (
                <div key={product.id} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm flex flex-col">
                    <img src={product.image} alt={product.name} className="w-full h-40 object-cover mb-4 rounded" />
                    <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
                    <p className="text-gray-500 text-sm mb-2">{product.category}</p>
                    <div className="mt-auto flex items-center justify-between">
                        <span className="text-xl font-bold text-gray-900">${product.price}</span>
                        <button
                            onClick={() => toast.success(`Added ${product.name} to cart!`)}
                            className="bg-black text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 transition"
                        >
                            Add to Cart
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
