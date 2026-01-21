import { useCallback, useState } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { db } from '@/db';
import { users } from '@/db/schema';

const getUsers = createServerFn({
	method: 'GET',
}).handler(async () => {
	const allUsers = await db.select().from(users);
	return allUsers;
});

const addUser = createServerFn({ method: 'POST' })
	.inputValidator((d: { name: string; email: string }) => {
		if (!d.name || !d.email) {
			throw new Error('Name and email are required');
		}
		return d;
	})
	.handler(async ({ data }) => {
		const [newUser] = await db
			.insert(users)
			.values({
				name: data.name,
				email: data.email,
			})
			.returning();
		return newUser;
	});

export const Route = createFileRoute('/demo/db-example')({
	component: DatabaseExample,
	loader: async () => await getUsers(),
});

function DatabaseExample() {
	const router = useRouter();
	const usersData = Route.useLoaderData();

	const [name, setName] = useState('');
	const [email, setEmail] = useState('');

	const submitUser = useCallback(async () => {
		if (!name.trim() || !email.trim()) {
			return;
		}
		await addUser({ data: { name: name.trim(), email: email.trim() } });
		setName('');
		setEmail('');
		router.invalidate();
	}, [name, email, router]);

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-4xl font-bold text-white mb-2">
					Database Integration Example
				</h1>
				<p className="text-gray-400 mb-8">
					This example demonstrates Drizzle ORM with SQLite in TanStack Start
				</p>

				<div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
					<h2 className="text-2xl font-semibold text-white mb-4">
						Add New User
					</h2>
					<div className="flex flex-col gap-4">
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Name"
							className="w-full px-4 py-3 rounded-lg border border-slate-600 bg-slate-700/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
						/>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="Email"
							className="w-full px-4 py-3 rounded-lg border border-slate-600 bg-slate-700/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
						/>
						<button
							disabled={!name.trim() || !email.trim()}
							onClick={submitUser}
							className="bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-500/50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
						>
							Add User
						</button>
					</div>
				</div>

				<div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
					<h2 className="text-2xl font-semibold text-white mb-4">
						Users ({usersData?.length || 0})
					</h2>
					{usersData && usersData.length > 0 ? (
						<div className="space-y-3">
							{usersData.map((user) => (
								<div
									key={user.id}
									className="bg-slate-700/50 border border-slate-600 rounded-lg p-4"
								>
									<div className="flex justify-between items-start">
										<div>
											<p className="text-white font-semibold text-lg">
												{user.name}
											</p>
											<p className="text-gray-400">{user.email}</p>
										</div>
										{user.createdAt && (
											<p className="text-gray-500 text-sm">
												{new Date(user.createdAt).toLocaleDateString()}
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-gray-400">No users yet. Add one above!</p>
					)}
				</div>
			</div>
		</div>
	);
}
