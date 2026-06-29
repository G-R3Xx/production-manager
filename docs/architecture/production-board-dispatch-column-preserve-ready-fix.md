# Production board dispatch column + ready state fix

- Fixed fullscreen board-side column detection so `Ready for install`, `Ready for delivery`, and `Ready for pickup` cannot fall back to Printing because of a broken word-boundary regex.
- When changing a production job dispatch type after it was already ready for pickup/delivery/install, the existing completed ready step is preserved and renamed instead of creating/keeping a pending duplicate ready step.
- Version bumped to V26.06.29.12.
