#include <fstream>
using namespace std;

int main()
{
	ofstream outFile("learnpos.md");
	int i;
	
	i = -1;
	while (++i < 10)
		outFile << i << " " << i + 1<< "\n";
	outFile.close();
	return (0);
}
