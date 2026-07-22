# interactive-graphs
This repository includes code for a Quarto website introducing core concepts about graphs and graph algorithms using Python and Observable JS to add interactive visualizations.

## Contributing and Running the website locally

### First Time Users

1. Clone this repository and navigate to the directory in your terminal.
2. Install the conda environment. In your terminal run:

```
conda env create -f conda_environment.yml
```

3. Add a `dsa_explain` kernel for Quarto to use:

```
python -m ipykernel install --user --name dsa_explain --display-name "Python (dsa_explain)"
```

### All users

1. Activate the `dsa_explain` conda environment:

```
conda activate dsa_explain
```

2. To preview the website locally, run this in the terminal from the root of the repository:

```
quarto preview
```

3. When ready to deploy an updated version of the website, run:

```
quarto render
```