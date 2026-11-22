"""Small command-line smoke demo. Tkinter UI is intentionally deferred."""
from .game import Connect4Game
from .config import GameConfig


def main() -> None:
    game = Connect4Game(GameConfig())
    print("Connect 4 engine ready (Part 1).")
    print(f"Board: {game.board.rows} x {game.board.columns}")
    print("Valid columns:", game.get_valid_moves())
    print("Run the automated suite with: python -m unittest discover -s connect4/tests -v")


if __name__ == "__main__":
    main()
