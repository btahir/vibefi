import figlet from 'figlet';
import gradient from 'gradient-string';

export async function showSplash(): Promise<void> {
  return new Promise((resolve) => {
    figlet.text('musicli', { font: 'Big' }, (err, result) => {
      if (err || !result) {
        process.stdout.write('\n  musicli\n\n');
        setTimeout(resolve, 800);
        return;
      }

      const grad = gradient(['#667eea', '#764ba2']);
      const colored = grad.multiline(result);
      process.stdout.write('\n' + colored + '\n');
      process.stdout.write('  \x1b[90myour focus room in the terminal\x1b[0m\n\n');
      setTimeout(resolve, 2000);
    });
  });
}
