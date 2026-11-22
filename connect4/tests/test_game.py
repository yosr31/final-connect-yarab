import unittest
from connect4.board import Board, generate_blocked_cells
from connect4.config import RED, YELLOW, GameConfig
from connect4.game import Connect4Game

class BoardTests(unittest.TestCase):
    def test_horizontal_win(self):
        b = Board()
        for c in range(4): b.grid[5][c] = RED
        self.assertEqual(b.check_winner(), RED)
        self.assertEqual(len(b.winning_positions(RED)), 4)

    def test_vertical_win(self):
        b = Board()
        for r in range(2, 6): b.grid[r][3] = YELLOW
        self.assertEqual(b.check_winner(), YELLOW)

    def test_both_diagonal_wins(self):
        b = Board()
        for i in range(4): b.grid[i][i] = RED
        self.assertEqual(b.check_winner(), RED)
        b = Board()
        for i in range(4): b.grid[i][3-i] = YELLOW
        self.assertEqual(b.check_winner(), YELLOW)

    def test_blocker_breaks_win(self):
        b = Board(blocked_cells={(5, 2)})
        for c in (0, 1, 3, 4): b.grid[5][c] = RED
        self.assertIsNone(b.check_winner())

    def test_sizes_and_reproducible_blockers(self):
        for rows, cols in ((5, 6), (6, 7), (7, 8)):
            self.assertEqual((Board(rows, cols).rows, Board(rows, cols).columns), (rows, cols))
        self.assertEqual(generate_blocked_cells(6, 7, 5, 42), generate_blocked_cells(6, 7, 5, 42))
        self.assertEqual(GameConfig.preset("small").rows, 5)
        self.assertEqual(GameConfig.preset("large").columns, 8)

    def test_gravity_and_blocker_segments(self):
        b = Board(6, 4, {(3, 0)})
        self.assertEqual(b.drop(0, RED), (5, 0))
        self.assertEqual(b.drop(0, YELLOW), (4, 0))
        self.assertEqual(b.drop(0, RED), (2, 0))
        self.assertEqual(b.drop(0, YELLOW), (1, 0))
        self.assertEqual(b.drop(0, RED), (0, 0))
        self.assertIsNone(b.landing_position(0))

    def test_full_column(self):
        b = Board(4, 4)
        for r in range(4): b.grid[r][0] = RED
        self.assertNotIn(0, b.valid_moves())
        with self.assertRaises(ValueError): b.drop(0, YELLOW)

    def test_draw(self):
        b = Board(4, 4)
        pattern = [[RED, RED, YELLOW, YELLOW], [YELLOW, YELLOW, RED, RED],
                   [RED, RED, YELLOW, YELLOW], [YELLOW, YELLOW, RED, RED]]
        b.grid = pattern
        self.assertTrue(b.is_full())
        self.assertIsNone(b.check_winner())

    def test_invalid_moves(self):
        b = Board()
        with self.assertRaises(ValueError): b.drop(-1, RED)
        with self.assertRaises(ValueError): b.drop(0, 9)

class GameTests(unittest.TestCase):
    def test_game_turns_and_winner(self):
        g = Connect4Game()
        for c in (0, 0, 1, 1, 2, 2, 3): g.make_move(c)
        self.assertEqual(g.winner, RED)
        self.assertTrue(g.is_terminal_state())

    def test_powerup_remove_and_restrictions(self):
        g = Connect4Game()
        g.make_move(0)  # red
        g.make_move(1)  # yellow
        g.make_move(0)  # red
        g.make_move(1)  # yellow
        # Red's turn; opponent piece at row 4, col 1.
        g.use_remove_opponent((4, 1))
        self.assertFalse(g.powerups.available[RED]["remove_opponent"])
        self.assertFalse(g.powerups.available[RED]["heavy_piece"])
        with self.assertRaises(ValueError): g.use_remove_opponent((5, 1))
        g.make_move(2)  # Yellow uses a normal move; Red gets the turn again.
        with self.assertRaises(ValueError): g.use_heavy_piece(2, 3)

    def test_heavy_piece_atomic_and_undo(self):
        g = Connect4Game()
        positions = g.use_heavy_piece(2, 3)
        self.assertEqual(positions, ((5, 2), (5, 3)))
        self.assertFalse(g.powerups.available[RED]["heavy_piece"])
        self.assertTrue(g.undo_last_move())
        self.assertTrue(g.powerups.available[RED]["heavy_piece"])
        self.assertTrue(g.powerups.available[RED]["remove_opponent"])
        self.assertEqual(g.board.grid[5][2], 0)
        g = Connect4Game(GameConfig(blocked_count=0))
        with self.assertRaises(ValueError): g.use_heavy_piece(0, 2)

    def test_pop_out_and_undo(self):
        g = Connect4Game(GameConfig(pop_out_enabled=True))
        g.make_move(0)  # red bottom
        g.make_move(1)  # yellow bottom
        g.make_move(0)  # red above
        g.make_move(1)  # yellow; red to play
        # Red to play; own piece bottom of col 0
        g.pop_out(0)
        self.assertEqual(g.board.grid[5][0], RED)  # upper red falls
        self.assertTrue(g.undo_last_move())
        self.assertEqual(g.board.grid[4][0], RED)
        with self.assertRaises(ValueError): g.pop_out(1)

    def test_pop_out_disabled(self):
        with self.assertRaises(ValueError): Connect4Game().pop_out(0)

    def test_undo_restores_full_state(self):
        g = Connect4Game()
        g.use_heavy_piece(0, 1)
        self.assertEqual(g.current_player, YELLOW)
        g.undo_move()
        self.assertEqual(g.current_player, RED)
        self.assertEqual(g.move_history, [])
        self.assertTrue(g.powerups.available[RED]["heavy_piece"])

    def test_undo_winning_move_restores_scores(self):
        g = Connect4Game()
        for column in (0, 0, 1, 1, 2, 2, 3):
            g.make_move(column)
        self.assertEqual(g.scores[RED], 1)
        self.assertEqual(len(g.score_history), 1)
        g.undo_last_move()
        self.assertIsNone(g.winner)
        self.assertEqual(g.scores[RED], 0)
        self.assertEqual(g.score_history, [])

    def test_restart_and_reset(self):
        g = Connect4Game()
        g.make_move(0)
        g.restart_game()
        self.assertEqual(g.current_player, RED)
        self.assertEqual(g.move_history, [])
        g.scores[RED] = 3
        g.reset_game()
        self.assertEqual(g.scores[RED], 0)

    def test_remove_opponent_applies_gravity(self):
        g = Connect4Game()
        for column in (0, 1, 1, 2, 2, 3):
            g.make_move(column)
        # Yellow is at the bottom of column 1; Red is directly above it.
        g.use_remove_opponent((5, 1))
        self.assertEqual(g.board.grid[5][1], RED)
        self.assertEqual(g.board.grid[4][1], 0)

    def test_heavy_piece_full_column_is_atomic(self):
        g = Connect4Game()
        for row in range(g.board.rows):
            g.board.grid[row][1] = YELLOW
        before = g.board.as_list()
        with self.assertRaises(ValueError):
            g.use_heavy_piece(0, 1)
        self.assertEqual(g.board.as_list(), before)
        self.assertTrue(g.powerups.available[RED]["heavy_piece"])

    def test_invalid_heavy_is_atomic(self):
        g = Connect4Game()
        before = g.get_game_state()
        with self.assertRaises(ValueError): g.use_heavy_piece(1, 1)
        self.assertEqual(g.get_game_state(), before)

if __name__ == "__main__": unittest.main()
