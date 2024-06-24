const func = (fn) => () => {
    fn()
}

// func(() => console.log("Hello"));