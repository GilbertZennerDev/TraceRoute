import matplotlib.pyplot as plt
import numpy as np
import random as r

#plt.style.use('_mpl-gallery')

# make data
x = [r.randint(0, 10) for i in range(20)]#np.linspace(0, 10, 25)
y = [r.randint(0, 10) for i in range(20)]#4 + 1 * np.sin(2 * x2)

# plot
fig, ax = plt.subplots()

ax.plot(x, y, 'x', markeredgewidth=2)

ax.set(xlim=(0, 20), xticks=np.arange(1, 20),
       ylim=(0, 20), yticks=np.arange(1, 20))

plt.show()
