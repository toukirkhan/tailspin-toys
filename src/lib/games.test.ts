import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    describe('getAllGames filters', () => {
        let strategyId: number;
        let puzzleId: number;
        let firstPublisherId: number;

        beforeEach(async () => {
            const [strategy] = await db
                .insert(categories)
                .values({ name: 'Strategy', description: 'Strategy games' })
                .returning({ id: categories.id });
            const [puzzle] = await db
                .insert(categories)
                .values({ name: 'Puzzle', description: 'Puzzle games' })
                .returning({ id: categories.id });
            const [firstPublisher] = await db
                .insert(publishers)
                .values({ name: 'Pub One', description: 'First publisher' })
                .returning({ id: publishers.id });
            const [secondPublisher] = await db
                .insert(publishers)
                .values({ name: 'Pub Two', description: 'Second publisher' })
                .returning({ id: publishers.id });

            strategyId = strategy.id;
            puzzleId = puzzle.id;
            firstPublisherId = firstPublisher.id;

            await db.insert(games).values([
                {
                    title: 'Alpha',
                    description: 'Strategy from Pub One',
                    starRating: 4,
                    categoryId: strategy.id,
                    publisherId: firstPublisher.id,
                },
                {
                    title: 'Beta',
                    description: 'Puzzle from Pub One',
                    starRating: 4,
                    categoryId: puzzle.id,
                    publisherId: firstPublisher.id,
                },
                {
                    title: 'Gamma',
                    description: 'Strategy from Pub Two',
                    starRating: 4,
                    categoryId: strategy.id,
                    publisherId: secondPublisher.id,
                },
            ]);
        });

        it('filters by one category', async () => {
            const filtered = await getAllGames(db, { categoryIds: [strategyId] });
            expect(filtered.map((game) => game.title)).toEqual(['Alpha', 'Gamma']);
        });

        it('filters by publisher', async () => {
            const filtered = await getAllGames(db, { publisherId: firstPublisherId });
            expect(filtered.map((game) => game.title)).toEqual(['Alpha', 'Beta']);
        });

        it('combines category and publisher filters', async () => {
            const filtered = await getAllGames(db, {
                categoryIds: [strategyId],
                publisherId: firstPublisherId,
            });
            expect(filtered.map((game) => game.title)).toEqual(['Alpha']);
        });

        it('requires a game to match every selected category', async () => {
            const filtered = await getAllGames(db, {
                categoryIds: [strategyId, puzzleId],
            });
            expect(filtered).toEqual([]);
        });
    });
});
