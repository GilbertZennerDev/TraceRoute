#include <vector>
#include <iostream>
using namespace std;

int main()
{
	vector<int> v;
	vector<int>::iterator viter;

	v.push_back(1);
	viter = v.begin();
	while (viter != v.end())
	{
		cout << *viter << "\n";
		++viter;
	}
}
