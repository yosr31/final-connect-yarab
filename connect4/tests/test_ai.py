import unittest
from connect4.ai.search import minimax, alphabeta, legal_moves, winner, evaluate
from connect4.analytics.benchmark import load_scenarios, run_benchmark
from pathlib import Path
import tempfile

class SearchTests(unittest.TestCase):
    def test_empty_board_agreement_and_center_move(self):
        b=[[0]*7 for _ in range(6)]
        mm=minimax(b,1,3); ab=alphabeta(b,1,3)
        self.assertEqual((mm.score,mm.move),(ab.score,ab.move)); self.assertEqual(mm.move,3)
    def test_alpha_beta_visits_no_more_nodes(self):
        b=[[0]*7 for _ in range(6)]
        b[5][0:3]=[1,2,1]
        mm=minimax(b,1,4); ab=alphabeta(b,1,4)
        self.assertEqual((mm.score,mm.move),(ab.score,ab.move))
        self.assertLessEqual(ab.nodes_visited,mm.nodes_visited)
        self.assertGreaterEqual(ab.pruned_branches,0)
    def test_immediate_win_selected(self):
        b=[[0]*7 for _ in range(6)]; b[5][0:3]=[1,1,1]
        self.assertEqual(minimax(b,1,2).move,3)
    def test_blocked_cells_respected(self):
        b=[[0]*4 for _ in range(4)]; blocked={(3,1)}
        self.assertIn(1,legal_moves(b,blocked))  # upper segment remains playable above the blocker
        self.assertEqual(legal_moves(b),[0,1,2,3])
        self.assertEqual(__import__("connect4.ai.search",fromlist=["drop"]).drop(b,1,1,blocked),2)
    def test_board_not_mutated(self):
        b=[[0]*7 for _ in range(6)]; before=[r[:] for r in b]
        alphabeta(b,1,3); self.assertEqual(b,before)
    def test_dataset_and_real_benchmark(self):
        root=Path(__file__).resolve().parents[2]
        source=root/"connect4_ai_benchmark_dataset.csv"
        if not source.exists(): self.skipTest("sample dataset not copied next to project")
        self.assertEqual(len(load_scenarios(source)),30)
        with tempfile.TemporaryDirectory() as d:
            result=run_benchmark(source,Path(d)/"out.csv",2)
            self.assertEqual(len(result),30); self.assertTrue(result.search_agreement.all())

if __name__=="__main__": unittest.main()
