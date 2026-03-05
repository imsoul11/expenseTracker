const authMiddleware = async (req,res,next) =>{
    try{
        const accessToken = req.headers.authorization;
        if(!accessToken){
            return res.status(401).json({message: "Unauthorized"});
        }
        const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
        if(!decoded){
            return res.status(401).json({message: "Unauthorized"});
        }
        req.user = decoded;
        console.log("user", req.user);
        next();
    }catch(error){
        console.log(error);
        res.status(500).json({message: "Internal server error"});
    }
}

module.exports = authMiddleware;